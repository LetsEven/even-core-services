import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { newOpaqueToken, sha256Hex } from '../auth/tokens.js'
import { recordPairFail, writeAudit } from '../db/audit.js'
import { insertPairingCode, normalizePairingCode } from '../db/pairing.js'
import { branchBelongsToRestaurant } from '../db/users.js'
import { clientIp, fail, parseJson } from '../http.js'
import { RateLimiter, rateLimit } from '../middleware/rateLimit.js'
import { requireRole } from '../middleware/requireRole.js'
import type { AppEnv, Deps } from '../types.js'

const createCodeSchema = z.object({
  branchId: z.string().min(1).max(64).optional(),
  deviceName: z.string().trim().min(1).max(80).optional(),
})
const pairSchema = z.object({
  pairingCode: z.string().min(6).max(32),
  deviceName: z.string().trim().min(1).max(80).optional(),
})

export function deviceRoutes(deps: Deps) {
  const { db, config, now } = deps
  const app = new Hono<AppEnv>()
  const ip = (c: Parameters<typeof clientIp>[0]) => clientIp(c, config.trustProxyHops)
  const pairLimiter = new RateLimiter({ windowMs: config.rateLimit.windowMs, now })

  // Solo super: crea un codigo de un solo uso con 10 min de vigencia.
  app.post('/v1/devices/pairing-codes', requireRole(deps, 'super'), async (c) => {
    const body = await parseJson(c, createCodeSchema)
    const auth = c.get('auth')
    const branchId = body.branchId ?? auth.branchId
    if (!branchBelongsToRestaurant(db, branchId, auth.restaurantId)) {
      return fail(c, 403, 'forbidden', 'Sucursal no permitida')
    }
    const t = now()
    const { code, expiresAt } = insertPairingCode(db, t, config.pairingTtlMs, {
      branchId,
      deviceName: body.deviceName ?? 'Dispositivo',
      createdBy: auth.userId,
    })
    writeAudit(db, t, { restaurantId: auth.restaurantId, actorId: auth.userId, action: 'pairing_code.create', target: branchId, ip: ip(c) })
    return c.json({ pairingCode: code, branchId, expiresAt }, 201)
  })

  app.post(
    '/v1/devices/pair',
    rateLimit(pairLimiter, { key: (c) => `ip:${ip(c)}`, max: config.rateLimit.pairPerIp }),
    async (c) => {
      const body = await parseJson(c, pairSchema)
      const t = now()
      const hash = sha256Hex(normalizePairingCode(body.pairingCode))
      const deviceId = randomUUID()
      const deviceToken = newOpaqueToken()

      const result = db.transaction(() => {
        // Consumo atomico: un solo uso aunque lleguen dos peticiones a la vez.
        const used = db
          .prepare(
            'UPDATE pairing_codes SET used_at = ?, updated_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?',
          )
          .run(t, t, hash, t)
        if (used.changes !== 1) return undefined
        const pc = db
          .prepare('SELECT branch_id, restaurant_id, device_name, created_by FROM pairing_codes WHERE code_hash = ?')
          .get(hash) as { branch_id: string; restaurant_id: string | null; device_name: string; created_by: string }
        db.prepare(
          `INSERT INTO devices (id, branch_id, restaurant_id, name, token_hash, last_seen_at, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          deviceId,
          pc.branch_id,
          pc.restaurant_id,
          body.deviceName ?? pc.device_name,
          sha256Hex(deviceToken),
          t,
          t + config.deviceTtlMs,
          t,
          t,
        )
        return pc
      })()

      if (!result) {
        recordPairFail(db, t, ip(c))
        return fail(c, 401, 'invalid_code', 'Codigo invalido o vencido')
      }
      writeAudit(db, t, { restaurantId: result.restaurant_id, actorId: result.created_by, action: 'device.pair', target: deviceId, ip: ip(c), meta: { branchId: result.branch_id } })
      return c.json({ deviceToken, branchId: result.branch_id }, 201)
    },
  )

  // Solo super: dispositivos vigentes de su restaurante (nunca el hash del token).
  app.get('/v1/devices', requireRole(deps, 'super'), (c) => {
    const auth = c.get('auth')
    const t = now()
    const rows = db
      .prepare(
        `SELECT id, name, branch_id, last_seen_at, expires_at, created_at FROM devices
         WHERE restaurant_id = ? AND deleted_at IS NULL AND revoked_at IS NULL AND expires_at > ?
         ORDER BY branch_id, created_at`,
      )
      .all(auth.restaurantId, t) as {
      id: string
      name: string
      branch_id: string
      last_seen_at: number | null
      expires_at: number
      created_at: number
    }[]
    return c.json({
      devices: rows.map((r) => ({
        id: r.id,
        name: r.name,
        branchId: r.branch_id,
        lastSeenAt: r.last_seen_at,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        current: r.id === auth.deviceId,
      })),
    })
  })

  // Solo super y solo de su restaurante: revoca el dispositivo y todas sus sesiones.
  app.delete('/v1/devices/:id', requireRole(deps, 'super'), (c) => {
    const auth = c.get('auth')
    const id = c.req.param('id')
    const t = now()
    const revoked = db.transaction(() => {
      const res = db
        .prepare(
          `UPDATE devices SET revoked_at = ?, updated_at = ?
           WHERE id = ? AND restaurant_id = ? AND deleted_at IS NULL AND revoked_at IS NULL`,
        )
        .run(t, t, id, auth.restaurantId)
      if (res.changes !== 1) return false
      db.prepare('UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE device_id = ? AND revoked_at IS NULL').run(t, t, id)
      return true
    })()
    if (!revoked) return fail(c, 404, 'not_found', 'Dispositivo no encontrado')
    writeAudit(db, t, { restaurantId: auth.restaurantId, actorId: auth.userId, action: 'device.revoke', target: id, ip: ip(c) })
    return c.json({ ok: true })
  })

  return app
}

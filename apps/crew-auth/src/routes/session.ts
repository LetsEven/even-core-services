import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { applyFailure, reserveAttempt, resetOnSuccess } from '../auth/lockout.js'
import { burnPinVerification, pinSchema, verifyPin } from '../auth/pin.js'
import { permissionsFor } from '../auth/roles.js'
import { newOpaqueToken, sha256Hex } from '../auth/tokens.js'
import { writeAudit } from '../db/audit.js'
import { getUser, revokeUserSessions } from '../db/users.js'
import type { UserRow } from '../db/users.js'
import { clientIp, fail, parseJson } from '../http.js'
import { deviceAuth } from '../middleware/deviceAuth.js'
import { RateLimiter, rateLimit } from '../middleware/rateLimit.js'
import type { AppEnv, Deps } from '../types.js'

const loginSchema = z.object({ userId: z.string().min(1).max(64), pin: pinSchema })
const refreshSchema = z.object({ refreshToken: z.string().min(16).max(256) })

function sessionUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    branchId: u.branch_id,
    restaurantId: u.restaurant_id,
    permissions: permissionsFor(u.role, { cocinaOperar: u.cocina_operar === 1 }),
  }
}

async function issueTokens(deps: Deps, user: UserRow, deviceId: string, sessionId: string, refreshToken: string) {
  const { signer, config, now } = deps
  const u = sessionUser(user)
  const accessToken = await signer.signAccess(
    {
      sub: u.id,
      role: u.role,
      permissions: u.permissions,
      branchId: u.branchId,
      restaurantId: u.restaurantId,
      deviceId,
      sid: sessionId,
    },
    now(),
    config.accessTtlSec,
  )
  return { accessToken, refreshToken, expiresIn: config.accessTtlSec, user: u }
}

function createSession(deps: Deps, userId: string, deviceId: string): { id: string; refreshToken: string } {
  const { db, config, now } = deps
  const t = now()
  const id = randomUUID()
  const refreshToken = newOpaqueToken()
  db.prepare(
    `INSERT INTO sessions (id, user_id, device_id, refresh_hash, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, deviceId, sha256Hex(refreshToken), t + config.refreshTtlMs, t, t)
  return { id, refreshToken }
}

interface SessionRow {
  id: string
  user_id: string
  device_id: string
  expires_at: number
  revoked_at: number | null
}

export function sessionRoutes(deps: Deps) {
  const { db, config, now } = deps
  const app = new Hono<AppEnv>()
  const ip = (c: Parameters<typeof clientIp>[0]) => clientIp(c, config.trustProxyHops)
  const limiter = new RateLimiter({ windowMs: config.rateLimit.windowMs, now })

  app.post(
    '/v1/login',
    // Primero la regla por IP (corta ahi); la de dispositivo va despues de deviceAuth, con el id real.
    rateLimit(limiter, { key: (c) => `ip:${ip(c)}`, max: config.rateLimit.loginPerIp }),
    deviceAuth(deps),
    rateLimit(limiter, { key: (c) => `dev:${c.get('device').id}`, max: config.rateLimit.loginPerDevice }),
    async (c) => {
      const body = await parseJson(c, loginSchema)
      const device = c.get('device')
      const t = now()
      const user = getUser(db, body.userId)
      const eligible = user !== undefined && user.active === 1 && user.branch_id === device.branchId
      const generic = () => fail(c, 401, 'invalid_credentials', 'Credenciales invalidas')

      if (!eligible) {
        await burnPinVerification(body.pin)
        writeAudit(db, t, {
          actorId: user?.id ?? null,
          action: 'login.fail',
          target: body.userId,
          ip: ip(c),
          meta: { deviceId: device.id, reason: 'unknown_or_inactive' },
        })
        return generic()
      }

      // Reserva atomica del intento antes de scrypt; si el ciclo esta agotado o hay bloqueo vigente,
      // se responde igual de generico sin verificar el PIN.
      const reserved = reserveAttempt(db, config, user.id, device.id, t)
      if (!reserved.ok) {
        await burnPinVerification(body.pin)
        const recent = db
          .prepare("SELECT 1 AS x FROM audit_log WHERE action = 'login.blocked' AND target = ? AND at > ? LIMIT 1")
          .get(user.id, t - 60_000)
        if (!recent) {
          writeAudit(db, t, {
            actorId: user.id,
            action: 'login.blocked',
            target: user.id,
            ip: ip(c),
            meta: { deviceId: device.id, scope: reserved.scope },
          })
        }
        return generic()
      }

      const ok = await verifyPin(body.pin, user.pin_hash, user.pin_salt)
      if (!ok) {
        writeAudit(db, t, {
          actorId: user.id,
          action: 'login.fail',
          target: user.id,
          ip: ip(c),
          meta: { deviceId: device.id, reason: 'bad_pin' },
        })
        for (const lock of applyFailure(db, config, user.id, device.id, reserved.reservation, t)) {
          writeAudit(db, t, {
            actorId: user.id,
            action: 'user.locked',
            target: user.id,
            ip: ip(c),
            meta: { scope: lock.scope, until: lock.until, lockCount: lock.lockCount, deviceId: device.id },
          })
        }
        return generic()
      }

      resetOnSuccess(db, user.id, device.id, t)
      // Renueva la vigencia del token de dispositivo con cada login exitoso.
      db.prepare('UPDATE devices SET expires_at = ?, updated_at = ? WHERE id = ?').run(t + config.deviceTtlMs, t, device.id)
      const s = createSession(deps, user.id, device.id)
      writeAudit(db, t, { actorId: user.id, action: 'login.ok', target: user.id, ip: ip(c), meta: { deviceId: device.id, sid: s.id } })
      return c.json(await issueTokens(deps, user, device.id, s.id, s.refreshToken))
    },
  )

  app.post('/v1/refresh', async (c) => {
    const body = await parseJson(c, refreshSchema)
    const t = now()
    const hash = sha256Hex(body.refreshToken)
    const old = db
      .prepare('SELECT id, user_id, device_id, expires_at, revoked_at FROM sessions WHERE refresh_hash = ?')
      .get(hash) as SessionRow | undefined
    const invalid = () => fail(c, 401, 'invalid_token', 'Sesion invalida')
    if (!old) return invalid()

    if (old.revoked_at !== null) {
      // Reuso de un refresh ya rotado o revocado: se asume robo y se cierran las sesiones del dispositivo.
      db.prepare(
        'UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL',
      ).run(t, t, old.user_id, old.device_id)
      writeAudit(db, t, { actorId: old.user_id, action: 'refresh.reuse', target: old.id, ip: ip(c) })
      return invalid()
    }
    if (old.expires_at <= t) return invalid()

    const user = getUser(db, old.user_id)
    const device = db
      .prepare('SELECT id FROM devices WHERE id = ? AND deleted_at IS NULL AND revoked_at IS NULL AND expires_at > ?')
      .get(old.device_id, t)
    if (!user || user.active !== 1 || !device) {
      revokeUserSessions(db, t, old.user_id)
      return invalid()
    }

    const rotated = db.transaction(() => {
      const res = db
        .prepare('UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL')
        .run(t, t, old.id)
      if (res.changes !== 1) return undefined
      return createSession(deps, user.id, old.device_id)
    })()
    if (!rotated) return invalid()

    writeAudit(db, t, { actorId: user.id, action: 'refresh', target: rotated.id, ip: ip(c) })
    return c.json(await issueTokens(deps, user, old.device_id, rotated.id, rotated.refreshToken))
  })

  app.post('/v1/logout', async (c) => {
    const body = await parseJson(c, refreshSchema)
    const t = now()
    const s = db
      .prepare('SELECT id, user_id FROM sessions WHERE refresh_hash = ? AND revoked_at IS NULL')
      .get(sha256Hex(body.refreshToken)) as { id: string; user_id: string } | undefined
    if (s) {
      db.prepare('UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE id = ?').run(t, t, s.id)
      writeAudit(db, t, { actorId: s.user_id, action: 'logout', target: s.id, ip: ip(c) })
    }
    // Idempotente: no revela si el token existia.
    return c.json({ ok: true })
  })

  return app
}

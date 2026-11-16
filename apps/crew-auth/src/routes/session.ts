import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { GraceCache } from '../auth/graceCache.js'
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
    `INSERT INTO sessions (id, user_id, device_id, refresh_hash, expires_at, absolute_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, deviceId, sha256Hex(refreshToken), t + config.refreshTtlMs, t + config.sessionAbsoluteTtlMs, t, t)
  return { id, refreshToken }
}

interface SessionRow {
  id: string
  user_id: string
  device_id: string
  expires_at: number
  absolute_expires_at: number
  rotated_at: number | null
  revoked_at: number | null
}

const SESSION_COLS = 'id, user_id, device_id, expires_at, absolute_expires_at, rotated_at, revoked_at'

type LoginResponse = Awaited<ReturnType<typeof issueTokens>>

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
      // El evento es del restaurante del dispositivo (aunque el usuario no exista o sea de otro).
      const restaurantId = device.restaurantId ?? user?.restaurant_id ?? null
      const eligible = user !== undefined && user.active === 1 && user.branch_id === device.branchId
      const generic = () => fail(c, 401, 'invalid_credentials', 'Credenciales invalidas')

      if (!eligible) {
        await burnPinVerification(body.pin)
        writeAudit(db, t, {
          restaurantId,
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
            restaurantId,
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
          restaurantId,
          actorId: user.id,
          action: 'login.fail',
          target: user.id,
          ip: ip(c),
          meta: { deviceId: device.id, reason: 'bad_pin' },
        })
        for (const lock of applyFailure(db, config, user.id, device.id, reserved.reservation, t)) {
          writeAudit(db, t, {
            restaurantId,
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
      writeAudit(db, t, { restaurantId, actorId: user.id, action: 'login.ok', target: user.id, ip: ip(c), meta: { deviceId: device.id, sid: s.id } })
      return c.json(await issueTokens(deps, user, device.id, s.id, s.refreshToken))
    },
  )

  // Respuestas de refresh de los ultimos segundos (ver GraceCache).
  const grace = new GraceCache<LoginResponse>(config.refreshGraceMs, now)

  // Decision: el `sid` es estable entre rotaciones. Rotar cambia el refresh token de la MISMA sesion
  // (se guarda el hash del anterior), de modo que el access token vigente de otra pestana sigue
  // valiendo hasta que vence o se revoca la sesion (logout, reuso, dispositivo revocado); antes cada
  // rotacion revocaba el `sid` anterior y las demas pestanas recibian 401 hasta adoptar el token nuevo.
  // El tope absoluto (7 dias) se fija en el login; la ventana deslizante (12 h) se renueva al rotar.
  app.post('/v1/refresh', deviceAuth(deps), async (c) => {
    const body = await parseJson(c, refreshSchema)
    const device = c.get('device')
    const t = now()
    const hash = sha256Hex(body.refreshToken)
    const invalid = () => fail(c, 401, 'invalid_token', 'Sesion invalida')
    const mismatch = (s: SessionRow) => {
      writeAudit(db, t, { restaurantId: device.restaurantId, actorId: s.user_id, action: 'refresh.device_mismatch', target: s.id, ip: ip(c), meta: { deviceId: device.id } })
      return invalid()
    }

    const cur = db.prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE refresh_hash = ?`).get(hash) as SessionRow | undefined
    if (!cur) {
      const prev = db.prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE prev_refresh_hash = ?`).get(hash) as
        | SessionRow
        | undefined
      if (!prev) return invalid()
      if (prev.device_id !== device.id) return mismatch(prev)
      // Sesion ya cerrada: nada que proteger (no se cascadea).
      if (prev.revoked_at !== null) return invalid()
      // Reuso dentro de la ventana de gracia: misma respuesta que recibio la rotacion (respuesta
      // perdida, dos pestanas). Pasada la ventana es un refresh ya rotado reutilizado: se asume robo.
      const again = prev.rotated_at !== null && t - prev.rotated_at <= config.refreshGraceMs ? grace.get(hash) : undefined
      if (again) return c.json(await again)
      db.prepare(
        'UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL',
      ).run(t, t, prev.user_id, prev.device_id)
      writeAudit(db, t, { restaurantId: device.restaurantId, actorId: prev.user_id, action: 'refresh.reuse', target: prev.id, ip: ip(c), meta: { deviceId: device.id } })
      return invalid()
    }

    if (cur.device_id !== device.id) return mismatch(cur)
    if (cur.revoked_at !== null) return invalid()
    if (cur.expires_at <= t || cur.absolute_expires_at <= t) return invalid()

    const user = getUser(db, cur.user_id)
    if (!user || user.active !== 1) {
      revokeUserSessions(db, t, cur.user_id)
      return invalid()
    }

    const refreshToken = newOpaqueToken()
    const rotated = db
      .prepare(
        `UPDATE sessions SET prev_refresh_hash = refresh_hash, refresh_hash = ?, rotated_at = ?, expires_at = ?, updated_at = ?
         WHERE id = ? AND refresh_hash = ? AND revoked_at IS NULL`,
      )
      .run(sha256Hex(refreshToken), t, Math.min(t + config.refreshTtlMs, cur.absolute_expires_at), t, cur.id, hash)
    if (rotated.changes !== 1) return invalid()

    // Todo lo anterior es sincrono: dos peticiones con el mismo token no se intercalan, y la segunda
    // entra por la rama de gracia. La promesa se guarda antes de esperar la firma del access token.
    const response = issueTokens(deps, user, cur.device_id, cur.id, refreshToken)
    grace.set(hash, response)
    writeAudit(db, t, { restaurantId: device.restaurantId ?? user.restaurant_id, actorId: user.id, action: 'refresh', target: cur.id, ip: ip(c) })
    return c.json(await response)
  })

  app.post('/v1/logout', deviceAuth(deps), async (c) => {
    const body = await parseJson(c, refreshSchema)
    const device = c.get('device')
    const t = now()
    const hash = sha256Hex(body.refreshToken)
    // Tambien vale el refresh anterior (otra pestana pudo rotar justo antes).
    const s = db
      .prepare('SELECT id, user_id, device_id FROM sessions WHERE (refresh_hash = ? OR prev_refresh_hash = ?) AND revoked_at IS NULL')
      .get(hash, hash) as { id: string; user_id: string; device_id: string } | undefined
    if (s && s.device_id !== device.id) {
      writeAudit(db, t, { restaurantId: device.restaurantId, actorId: s.user_id, action: 'refresh.device_mismatch', target: s.id, ip: ip(c), meta: { deviceId: device.id } })
      return fail(c, 401, 'invalid_token', 'Sesion invalida')
    }
    if (s) {
      db.prepare('UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE id = ?').run(t, t, s.id)
      writeAudit(db, t, { restaurantId: device.restaurantId, actorId: s.user_id, action: 'logout', target: s.id, ip: ip(c) })
    }
    // Idempotente: no revela si el token existia.
    return c.json({ ok: true })
  })

  return app
}

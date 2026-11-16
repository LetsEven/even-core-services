import { Hono } from 'hono'
import { z } from 'zod'
import { clearLockout } from '../auth/lockout.js'
import { pinSchema, pinSchemaFor, hashPin } from '../auth/pin.js'
import { ROLES } from '../auth/roles.js'
import { writeAudit } from '../db/audit.js'
import {
  activeLockUntil,
  branchBelongsToRestaurant,
  countActiveSupers,
  getUser,
  insertUser,
  revokeUserSessions,
  toPublicUser,
} from '../db/users.js'
import type { UserRow } from '../db/users.js'
import { clientIp, fail, parseJson, parseQuery } from '../http.js'
import { deviceAuth } from '../middleware/deviceAuth.js'
import { requireRole } from '../middleware/requireRole.js'
import type { AppEnv, Deps } from '../types.js'

const roleSchema = z.enum(ROLES)
const nameSchema = z.string().trim().min(1).max(80)
const idSchema = z.string().min(1).max(64)

// El PIN se valida contra el rol (super: 6-8 digitos; el resto 4-8).
const pinForRole = (v: { role: z.infer<typeof roleSchema>; pin: string }, ctx: z.RefinementCtx) => {
  const r = pinSchemaFor(v.role).safeParse(v.pin)
  if (!r.success) ctx.addIssue({ code: 'custom', path: ['pin'], message: r.error.issues[0]?.message ?? 'PIN invalido' })
}

const createSchema = z
  .object({
    id: z.uuid().optional(),
    name: nameSchema,
    role: roleSchema,
    pin: pinSchema,
    branchId: idSchema.optional(),
    cocinaOperar: z.boolean().optional(),
  })
  .superRefine(pinForRole)
const patchSchema = z
  .object({
    name: nameSchema,
    role: roleSchema,
    active: z.boolean(),
    cocinaOperar: z.boolean(),
    branchId: idSchema,
    // Obligatorio al promover a super (no se conoce la longitud del PIN actual).
    pin: pinSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Sin cambios')
const resetPinSchema = z.object({ pin: pinSchema })
const listQuery = z.object({ branchId: idSchema.optional() })

export function userRoutes(deps: Deps) {
  const { db, config, now } = deps
  const app = new Hono<AppEnv>()
  const ip = (c: Parameters<typeof clientIp>[0]) => clientIp(c, config.trustProxy)
  const superOnly = requireRole(deps, 'super')

  // Selector de usuarios del dispositivo: solo id, name, role. Nunca hashes.
  app.get('/v1/users', deviceAuth(deps), (c) => {
    const device = c.get('device')
    const { branchId } = parseQuery(c, listQuery)
    if (branchId !== undefined && branchId !== device.branchId) {
      return fail(c, 403, 'forbidden', 'Sucursal no permitida')
    }
    const rows = db
      .prepare(
        `SELECT id, name, role FROM users
         WHERE branch_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
      )
      .all(device.branchId) as { id: string; name: string; role: string }[]
    return c.json({ users: rows.map((r) => ({ id: r.id, name: r.name, role: r.role })) })
  })

  // Listado administrativo (activos e inactivos), sin hashes.
  app.get('/v1/admin/users', superOnly, (c) => {
    const auth = c.get('auth')
    const rows = db
      .prepare('SELECT * FROM users WHERE restaurant_id = ? AND deleted_at IS NULL ORDER BY branch_id, name COLLATE NOCASE')
      .all(auth.restaurantId) as UserRow[]
    const t = now()
    return c.json({ users: rows.map((u) => toPublicUser(u, activeLockUntil(db, u, t))) })
  })

  app.post('/v1/users', superOnly, async (c) => {
    const body = await parseJson(c, createSchema)
    const auth = c.get('auth')
    const branchId = body.branchId ?? auth.branchId
    if (!branchBelongsToRestaurant(db, branchId, auth.restaurantId)) {
      return fail(c, 403, 'forbidden', 'Sucursal no permitida')
    }
    if (body.id && getUser(db, body.id)) return fail(c, 409, 'conflict', 'El id ya existe')
    const t = now()
    const user = await insertUser(db, t, {
      id: body.id,
      branchId,
      restaurantId: auth.restaurantId,
      name: body.name,
      role: body.role,
      pin: body.pin,
      cocinaOperar: body.role === 'cocina' ? body.cocinaOperar : false,
    })
    writeAudit(db, t, { actorId: auth.userId, action: 'user.create', target: user.id, ip: ip(c), meta: { role: user.role, branchId } })
    return c.json({ user: toPublicUser(user) }, 201)
  })

  const loadTarget = (c: Parameters<typeof clientIp>[0], id: string, restaurantId: string): UserRow => {
    const u = getUser(db, id)
    if (!u || u.restaurant_id !== restaurantId) return fail(c, 404, 'not_found', 'Usuario no encontrado')
    return u
  }

  app.patch('/v1/users/:id', superOnly, async (c) => {
    const body = await parseJson(c, patchSchema)
    const auth = c.get('auth')
    const target = loadTarget(c, c.req.param('id'), auth.restaurantId)
    const role = body.role ?? target.role
    const promotes = role === 'super' && target.role !== 'super'
    if (promotes && body.pin === undefined) {
      return fail(c, 400, 'invalid_request', 'Al promover a super hay que fijar un PIN de 6 a 8 digitos')
    }
    if (body.pin !== undefined) {
      const r = pinSchemaFor(role).safeParse(body.pin)
      if (!r.success) return fail(c, 400, 'invalid_request', r.error.issues[0]?.message)
    }
    const active = body.active ?? target.active === 1
    const branchId = body.branchId ?? target.branch_id
    if (branchId !== target.branch_id && !branchBelongsToRestaurant(db, branchId, auth.restaurantId)) {
      return fail(c, 403, 'forbidden', 'Sucursal no permitida')
    }
    const losesSuper = target.role === 'super' && target.active === 1 && (role !== 'super' || !active)
    if (losesSuper && countActiveSupers(db, target.restaurant_id, target.id) === 0) {
      return fail(c, 409, 'last_super', 'Debe quedar al menos un super activo')
    }
    const cocinaOperar = role === 'cocina' ? (body.cocinaOperar ?? target.cocina_operar === 1) : false
    const t = now()
    db.prepare(
      `UPDATE users SET name = ?, role = ?, active = ?, cocina_operar = ?, branch_id = ?, updated_at = ? WHERE id = ?`,
    ).run(body.name ?? target.name, role, active ? 1 : 0, cocinaOperar ? 1 : 0, branchId, t, target.id)
    if (body.pin !== undefined) {
      const { hash, salt } = await hashPin(body.pin)
      db.prepare('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?').run(hash, salt, target.id)
      clearLockout(db, target.id, t)
    }
    // Cambio de rol, sucursal o baja: se cierran sus sesiones para que el nuevo alcance aplique ya.
    if (role !== target.role || branchId !== target.branch_id || !active || body.pin !== undefined) {
      revokeUserSessions(db, t, target.id)
    }
    writeAudit(db, t, {
      actorId: auth.userId,
      action: 'user.update',
      target: target.id,
      ip: ip(c),
      meta: { fields: Object.keys(body) },
    })
    const updated = getUser(db, target.id) as UserRow
    return c.json({ user: toPublicUser(updated, activeLockUntil(db, updated, t)) })
  })

  app.post('/v1/users/:id/reset-pin', superOnly, async (c) => {
    const body = await parseJson(c, resetPinSchema)
    const auth = c.get('auth')
    const target = loadTarget(c, c.req.param('id'), auth.restaurantId)
    const rule = pinSchemaFor(target.role).safeParse(body.pin)
    if (!rule.success) return fail(c, 400, 'invalid_request', rule.error.issues[0]?.message)
    const { hash, salt } = await hashPin(body.pin)
    const t = now()
    db.prepare('UPDATE users SET pin_hash = ?, pin_salt = ?, updated_at = ? WHERE id = ?').run(hash, salt, t, target.id)
    clearLockout(db, target.id, t)
    revokeUserSessions(db, t, target.id)
    writeAudit(db, t, { actorId: auth.userId, action: 'user.reset_pin', target: target.id, ip: ip(c) })
    return c.json({ ok: true })
  })

  // Desbloquea sin tocar el PIN: limpia contadores y bloqueos (global y por dispositivo).
  app.post('/v1/users/:id/unlock', superOnly, (c) => {
    const auth = c.get('auth')
    const target = loadTarget(c, c.req.param('id'), auth.restaurantId)
    const t = now()
    clearLockout(db, target.id, t)
    writeAudit(db, t, { actorId: auth.userId, action: 'user.unlock', target: target.id, ip: ip(c) })
    return c.json({ ok: true })
  })

  app.delete('/v1/users/:id', superOnly, (c) => {
    const auth = c.get('auth')
    const target = loadTarget(c, c.req.param('id'), auth.restaurantId)
    if (target.id === auth.userId) return fail(c, 409, 'self_delete', 'No puedes eliminarte a ti mismo')
    if (target.role === 'super' && target.active === 1 && countActiveSupers(db, target.restaurant_id, target.id) === 0) {
      return fail(c, 409, 'last_super', 'Debe quedar al menos un super activo')
    }
    const t = now()
    db.prepare('UPDATE users SET deleted_at = ?, active = 0, updated_at = ? WHERE id = ?').run(t, t, target.id)
    revokeUserSessions(db, t, target.id)
    writeAudit(db, t, { actorId: auth.userId, action: 'user.delete', target: target.id, ip: ip(c) })
    return c.json({ ok: true })
  })

  return app
}

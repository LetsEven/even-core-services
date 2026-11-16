import { createMiddleware } from 'hono/factory'
import { isRole, permissionsFor } from '../auth/roles.js'
import type { Role } from '../auth/roles.js'
import { fail } from '../http.js'
import type { AppEnv, Deps } from '../types.js'

/**
 * Verifica el access token (Authorization: Bearer) y que la sesion siga vigente
 * (un logout o la desactivacion del usuario cortan el acceso de inmediato), y exige uno de los roles.
 * Rol y permisos se toman de la base, no del token.
 */
export function requireRole({ db, signer, now }: Deps, ...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!token) return fail(c, 401, 'unauthorized', 'No autorizado')
    let claims
    try {
      claims = await signer.verifyAccess(token, now())
    } catch {
      return fail(c, 401, 'unauthorized', 'No autorizado')
    }
    const row = db
      .prepare(
        `SELECT u.id, u.role, u.branch_id, u.restaurant_id, u.cocina_operar, s.device_id
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN devices d ON d.id = s.device_id AND d.revoked_at IS NULL
         WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > ?
           AND u.active = 1 AND u.deleted_at IS NULL`,
      )
      .get(claims.sid, claims.sub, now()) as
      | { id: string; role: string; branch_id: string; restaurant_id: string; cocina_operar: number; device_id: string }
      | undefined
    if (!row || !isRole(row.role)) return fail(c, 401, 'unauthorized', 'No autorizado')
    if (!roles.includes(row.role)) return fail(c, 403, 'forbidden', 'Permiso insuficiente')
    c.set('auth', {
      userId: row.id,
      role: row.role,
      permissions: permissionsFor(row.role, { cocinaOperar: row.cocina_operar === 1 }),
      branchId: row.branch_id,
      restaurantId: row.restaurant_id,
      deviceId: row.device_id,
      sid: claims.sid,
    })
    await next()
  })
}

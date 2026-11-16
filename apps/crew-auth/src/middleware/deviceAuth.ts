import { createMiddleware } from 'hono/factory'
import { sha256Hex } from '../auth/tokens.js'
import { fail } from '../http.js'
import type { AppEnv, Deps } from '../types.js'

/** Exige `X-Device-Token` (emitido en el pairing): vigente, no revocado y no vencido. */
export function deviceAuth({ db, now }: Deps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = c.req.header('x-device-token')
    if (!token) return fail(c, 401, 'device_required', 'Dispositivo no vinculado')
    const t = now()
    const row = db
      .prepare(
        `SELECT id, branch_id, restaurant_id, name FROM devices
         WHERE token_hash = ? AND deleted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      )
      .get(sha256Hex(token), t) as { id: string; branch_id: string; restaurant_id: string | null; name: string } | undefined
    if (!row) return fail(c, 401, 'device_required', 'Dispositivo no vinculado')
    db.prepare('UPDATE devices SET last_seen_at = ?, updated_at = ? WHERE id = ?').run(t, t, row.id)
    c.set('device', { id: row.id, branchId: row.branch_id, restaurantId: row.restaurant_id, name: row.name })
    await next()
  })
}

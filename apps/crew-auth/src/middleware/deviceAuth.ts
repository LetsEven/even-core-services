import { createMiddleware } from 'hono/factory'
import { sha256Hex } from '../auth/tokens.js'
import { fail } from '../http.js'
import type { AppEnv, Deps } from '../types.js'

/** Exige `X-Device-Token` (emitido en el pairing). */
export function deviceAuth({ db, now }: Deps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = c.req.header('x-device-token')
    if (!token) return fail(c, 401, 'device_required', 'Dispositivo no vinculado')
    const row = db
      .prepare('SELECT id, branch_id, name FROM devices WHERE token_hash = ? AND deleted_at IS NULL')
      .get(sha256Hex(token)) as { id: string; branch_id: string; name: string } | undefined
    if (!row) return fail(c, 401, 'device_required', 'Dispositivo no vinculado')
    const t = now()
    db.prepare('UPDATE devices SET last_seen_at = ?, updated_at = ? WHERE id = ?').run(t, t, row.id)
    c.set('device', { id: row.id, branchId: row.branch_id, name: row.name })
    await next()
  })
}

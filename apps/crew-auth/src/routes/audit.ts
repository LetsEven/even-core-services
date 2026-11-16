import { Hono } from 'hono'
import { z } from 'zod'
import { parseQuery } from '../http.js'
import { requireRole } from '../middleware/requireRole.js'
import type { AppEnv, Deps } from '../types.js'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().optional(),
  action: z.string().max(64).optional(),
})

export function auditRoutes(deps: Deps) {
  const { db } = deps
  const app = new Hono<AppEnv>()

  // Solo eventos del propio restaurante (actor o destino de un usuario del restaurante) y los sin actor.
  app.get('/v1/audit', requireRole(deps, 'super'), (c) => {
    const q = parseQuery(c, querySchema)
    const auth = c.get('auth')
    const rows = db
      .prepare(
        `SELECT a.id, a.at, a.actor_id, a.action, a.target, a.ip, a.meta_json
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
         WHERE (u.restaurant_id = ? OR a.actor_id IS NULL)
           AND (? IS NULL OR a.at < ?)
           AND (? IS NULL OR a.action = ?)
         ORDER BY a.at DESC, a.rowid DESC LIMIT ?`,
      )
      .all(auth.restaurantId, q.before ?? null, q.before ?? null, q.action ?? null, q.action ?? null, q.limit) as {
      id: string
      at: number
      actor_id: string | null
      action: string
      target: string | null
      ip: string | null
      meta_json: string | null
    }[]
    return c.json({
      events: rows.map((r) => ({
        id: r.id,
        at: r.at,
        actorId: r.actor_id,
        action: r.action,
        target: r.target,
        ip: r.ip,
        meta: r.meta_json ? (JSON.parse(r.meta_json) as unknown) : null,
      })),
    })
  })

  return app
}

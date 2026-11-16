import { randomUUID } from 'node:crypto'
import type { Db } from './index.js'

export interface AuditEntry {
  actorId?: string | null
  action: string
  target?: string | null
  ip?: string | null
  meta?: Record<string, unknown>
}

/** Nunca incluir PINs ni tokens en `meta`. */
export function writeAudit(db: Db, now: number, entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_log (id, at, actor_id, action, target, ip, meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    now,
    entry.actorId ?? null,
    entry.action,
    entry.target ?? null,
    entry.ip ?? null,
    entry.meta ? JSON.stringify(entry.meta) : null,
    now,
    now,
  )
}

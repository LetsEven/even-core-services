import { randomUUID } from 'node:crypto'
import type { Db } from './index.js'

export interface AuditEntry {
  /** Restaurante al que pertenece el evento (null = no atribuible: no lo ve ningun super). Obligatorio a proposito. */
  restaurantId: string | null
  actorId?: string | null
  action: string
  target?: string | null
  ip?: string | null
  meta?: Record<string, unknown>
}

/** Nunca incluir PINs ni tokens en `meta`. */
export function writeAudit(db: Db, now: number, entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_log (id, at, restaurant_id, actor_id, action, target, ip, meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    now,
    entry.restaurantId,
    entry.actorId ?? null,
    entry.action,
    entry.target ?? null,
    entry.ip ?? null,
    entry.meta ? JSON.stringify(entry.meta) : null,
    now,
    now,
  )
}

const PAIR_FAIL_WINDOW_MS = 60 * 60 * 1000
/** Con mas filas distintas que esto en la ventana, las IPs nuevas se agregan en una sola fila ('*'). */
export const PAIR_FAIL_MAX_ROWS = 100

/**
 * Los intentos fallidos de emparejamiento no necesitan una fila cada uno (es un endpoint publico:
 * llenaria la tabla): se agregan por (IP, hora) con un contador, y si hay demasiadas IPs distintas
 * en la ventana, en una fila comun.
 */
export function recordPairFail(db: Db, now: number, ip: string): void {
  const since = now - PAIR_FAIL_WINDOW_MS
  const find = (key: string) =>
    db
      .prepare("SELECT id, meta_json FROM audit_log WHERE action = 'device.pair_fail' AND ip = ? AND at > ? ORDER BY at DESC LIMIT 1")
      .get(key, since) as { id: string; meta_json: string | null } | undefined
  let key = ip
  let row = find(key)
  if (!row) {
    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'device.pair_fail' AND at > ?")
      .get(since) as { n: number }
    if (n >= PAIR_FAIL_MAX_ROWS) {
      key = '*'
      row = find(key)
    }
  }
  if (!row) {
    writeAudit(db, now, { restaurantId: null, action: 'device.pair_fail', ip: key, meta: { count: 1, firstAt: now } })
    return
  }
  const prev = row.meta_json ? (JSON.parse(row.meta_json) as { count?: number; firstAt?: number }) : {}
  const meta = { count: (prev.count ?? 1) + 1, firstAt: prev.firstAt ?? now }
  db.prepare('UPDATE audit_log SET at = ?, meta_json = ?, updated_at = ? WHERE id = ?').run(now, JSON.stringify(meta), now, row.id)
}

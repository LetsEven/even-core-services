import type { Context, MiddlewareHandler } from 'hono'

interface Bucket {
  count: number
  resetAt: number
}

export interface LimitRule {
  /** Devuelve la clave a limitar (p. ej. `ip:1.2.3.4`) o null para omitir la regla. */
  key: (c: Context) => string | null
  max: number
}

/** Ventana fija en memoria. Suficiente para una sola instancia (Railway con volumen o la Pi). */
export function rateLimit(opts: { windowMs: number; rules: LimitRule[]; now: () => number }): MiddlewareHandler {
  const buckets = new Map<string, Bucket>()
  return async (c, next) => {
    const now = opts.now()
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    }
    let retryAfterMs = 0
    for (const [i, rule] of opts.rules.entries()) {
      const key = rule.key(c)
      if (key === null) continue
      const id = `${i}:${key}`
      let b = buckets.get(id)
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + opts.windowMs }
        buckets.set(id, b)
      }
      b.count += 1
      if (b.count > rule.max) retryAfterMs = Math.max(retryAfterMs, b.resetAt - now)
    }
    if (retryAfterMs > 0) {
      c.header('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))))
      return c.json({ error: 'rate_limited', message: 'Demasiados intentos, intenta mas tarde' }, 429)
    }
    await next()
  }
}

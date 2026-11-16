import type { Context, MiddlewareHandler } from 'hono'

interface Bucket {
  count: number
  resetAt: number
}

export const MAX_BUCKETS = 10_000

/**
 * Ventana fija en memoria con tope de claves y desalojo LRU (el Map conserva el orden de insercion:
 * tocar una clave la mueve al final y se desaloja desde el principio). Cada `hit` es O(1): no hay
 * barridos de todo el mapa por peticion. Suficiente para una sola instancia (Railway con volumen o la Pi).
 * Un atacante con muchas claves distintas puede desalojar buckets ajenos: por eso las claves por
 * dispositivo solo se crean despues de autenticar el dispositivo.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  constructor(
    private readonly opts: { windowMs: number; now: () => number; maxBuckets?: number },
  ) {}

  get size(): number {
    return this.buckets.size
  }

  /** Cuenta un intento. Devuelve 0 si pasa, o los ms hasta que se libere la ventana si excede `max`. */
  hit(key: string, max: number): number {
    const now = this.opts.now()
    let b = this.buckets.get(key)
    if (b && b.resetAt <= now) b = undefined
    b ??= { count: 0, resetAt: now + this.opts.windowMs }
    b.count += 1
    this.buckets.delete(key)
    this.buckets.set(key, b)
    const cap = this.opts.maxBuckets ?? MAX_BUCKETS
    while (this.buckets.size > cap) {
      const oldest = this.buckets.keys().next()
      if (oldest.done) break
      this.buckets.delete(oldest.value)
    }
    return b.count > max ? b.resetAt - now : 0
  }
}

export interface LimitRule {
  /** Devuelve la clave a limitar (p. ej. `ip:1.2.3.4`) o null para omitir la regla. */
  key: (c: Context) => string | null
  max: number
}

/** Una regla por middleware: se encadenan en el orden en que conviene evaluarlas (la de IP primero). */
export function rateLimit(limiter: RateLimiter, rule: LimitRule): MiddlewareHandler {
  return async (c, next) => {
    const key = rule.key(c)
    if (key !== null) {
      const retryAfterMs = limiter.hit(key, rule.max)
      if (retryAfterMs > 0) {
        c.header('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))))
        return c.json({ error: 'rate_limited', message: 'Demasiados intentos, intenta mas tarde' }, 429)
      }
    }
    await next()
  }
}

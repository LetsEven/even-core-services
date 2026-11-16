import { isIP } from 'node:net'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

/** Acepta `1.2.3.4`, `1.2.3.4:5678`, `::1`, `[::1]:80`; devuelve null si no es una IP valida. */
function parseIp(raw: string): string | null {
  let v = raw.trim()
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(v)
  if (bracket) v = bracket[1] ?? ''
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(':'))
  return isIP(v) ? v.toLowerCase() : null
}

/**
 * IP del cliente. Con `trustProxyHops = N > 0` es la entrada N-esima desde la DERECHA de
 * X-Forwarded-For: cada proxy de confianza agrega al final la IP de quien le hablo, asi que lo que
 * esta a la izquierda lo controla el cliente (y se ignora). Si la cabecera trae menos de N entradas
 * o la entrada no es una IP, se usa la del socket (nunca un valor arbitrario del cliente).
 */
export function clientIp(c: Context, trustProxyHops: number): string {
  if (trustProxyHops > 0) {
    const parts = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const picked = parts.length >= trustProxyHops ? parseIp(parts[parts.length - trustProxyHops] ?? '') : null
    if (picked) return picked
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function fail(c: Context, status: 400 | 401 | 403 | 404 | 409 | 429, error: string, message?: string): never {
  throw new HTTPException(status, { res: c.json({ error, ...(message ? { message } : {}) }, status) })
}

export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return fail(c, 400, 'invalid_request', 'JSON invalido')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    throw new HTTPException(400, { res: c.json({ error: 'invalid_request', issues }, 400) })
  }
  return result.data
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.infer<S> {
  const result = schema.safeParse(c.req.query())
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    throw new HTTPException(400, { res: c.json({ error: 'invalid_request', issues }, 400) })
  }
  return result.data
}

import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (xff) return xff
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

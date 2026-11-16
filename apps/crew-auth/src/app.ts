import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { auditRoutes } from './routes/audit.js'
import { deviceRoutes } from './routes/devices.js'
import { sessionRoutes } from './routes/session.js'
import { userRoutes } from './routes/users.js'
import type { AppEnv, Deps } from './types.js'

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>()
  const { origins } = deps.config

  app.use(secureHeaders())
  app.use(
    cors({
      // Lista cerrada: un origen fuera de CREW_AUTH_ORIGINS no recibe cabeceras CORS.
      origin: (origin) => (origins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-Device-Token'],
      maxAge: 600,
    }),
  )
  app.use(bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'payload_too_large' }, 413) }))
  app.use(async (c, next) => {
    await next()
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
  })

  app.get('/health', (c) => c.json({ status: 'ok' }))
  app.get('/.well-known/jwks.json', (c) => {
    c.header('Cache-Control', 'public, max-age=300')
    return c.json(deps.signer.jwks())
  })

  app.route('/', deviceRoutes(deps))
  app.route('/', sessionRoutes(deps))
  app.route('/', userRoutes(deps))
  app.route('/', auditRoutes(deps))

  app.notFound((c) => c.json({ error: 'not_found' }, 404))
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    console.error('Error no controlado:', err instanceof Error ? err.message : 'desconocido')
    return c.json({ error: 'internal_error' }, 500)
  })

  return app
}

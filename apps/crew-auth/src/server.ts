import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createSigner, resolvePrivateKeyPem } from './auth/tokens.js'
import { loadConfig } from './config.js'
import { openDb } from './db/index.js'

async function main() {
  const config = loadConfig()
  const db = openDb(config.dbPath)
  const pem = await resolvePrivateKeyPem(config)
  const signer = await createSigner(pem, config.issuer)
  const app = createApp({ db, config, signer, now: () => Date.now() })

  if (config.origins.length === 0) {
    console.warn('CREW_AUTH_ORIGINS vacio: ningun origen de navegador podra llamar al servicio (CORS cerrado)')
  }
  const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
    console.log(`crew-auth escuchando en :${info.port} (kid ${signer.kid})`)
  })

  const shutdown = () => {
    server.close(() => {
      db.close()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err: unknown) => {
  console.error('No se pudo iniciar crew-auth:', err instanceof Error ? err.message : err)
  process.exit(1)
})

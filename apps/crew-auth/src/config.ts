export interface RateLimitConfig {
  windowMs: number
  loginPerIp: number
  loginPerDevice: number
  pairPerIp: number
}

export interface Config {
  port: number
  dataDir: string
  dbPath: string
  origins: string[]
  privateKeyPem: string | undefined
  issuer: string
  trustProxy: boolean
  rateLimit: RateLimitConfig
  accessTtlSec: number
  refreshTtlMs: number
  pairingTtlMs: number
  /** Vigencia del token de dispositivo; se renueva con cada login exitoso. */
  deviceTtlMs: number
  /** Fallos por ciclo para un (usuario, dispositivo). */
  maxFailedAttempts: number
  /** Fallos por ciclo para el usuario en total (todos los dispositivos); mayor que el anterior. */
  maxFailedAttemptsUser: number
  /** Primer bloqueo; cada bloqueo siguiente duplica la espera hasta `lockoutMaxMs`. */
  lockoutMs: number
  lockoutMaxMs: number
}

export const AUDIENCE = 'even-crew'

export const DEFAULTS = {
  accessTtlSec: 15 * 60,
  refreshTtlMs: 12 * 60 * 60 * 1000,
  pairingTtlMs: 10 * 60 * 1000,
  deviceTtlMs: 90 * 24 * 60 * 60 * 1000,
  maxFailedAttempts: 5,
  maxFailedAttemptsUser: 15,
  lockoutMs: 15 * 60 * 1000,
  lockoutMaxMs: 24 * 60 * 60 * 1000,
  rateLimit: {
    windowMs: 60_000,
    loginPerIp: 60,
    loginPerDevice: 20,
    pairPerIp: 10,
  } satisfies RateLimitConfig,
} as const

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.DATA_DIR?.trim() || './data'
  const port = Number(env.PORT ?? 8787)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT invalido')
  }
  const origins = (env.CREW_AUTH_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  // Las variables de entorno multilinea a veces llegan con "\n" literales.
  const pem = env.CREW_AUTH_PRIVATE_KEY?.trim().replace(/\\n/g, '\n')
  return {
    port,
    dataDir,
    dbPath: `${dataDir.replace(/\/+$/, '')}/crew-auth.db`,
    origins,
    privateKeyPem: pem || undefined,
    issuer: env.CREW_AUTH_ISSUER?.trim() || 'crew-auth',
    trustProxy: env.CREW_AUTH_TRUST_PROXY === '1',
    rateLimit: { ...DEFAULTS.rateLimit },
    accessTtlSec: DEFAULTS.accessTtlSec,
    refreshTtlMs: DEFAULTS.refreshTtlMs,
    pairingTtlMs: DEFAULTS.pairingTtlMs,
    deviceTtlMs: DEFAULTS.deviceTtlMs,
    maxFailedAttempts: DEFAULTS.maxFailedAttempts,
    maxFailedAttemptsUser: DEFAULTS.maxFailedAttemptsUser,
    lockoutMs: DEFAULTS.lockoutMs,
    lockoutMaxMs: DEFAULTS.lockoutMaxMs,
  }
}

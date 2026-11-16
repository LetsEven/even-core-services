import { createApp } from '../app.js'
import { generatePem, createSigner } from '../auth/tokens.js'
import { DEFAULTS, loadConfig } from '../config.js'
import type { Config } from '../config.js'
import { openDb } from '../db/index.js'
import { insertPairingCode } from '../db/pairing.js'
import { insertUser } from '../db/users.js'
import type { Role } from '../auth/roles.js'
import type { Signer } from '../auth/tokens.js'
import type { Db } from '../db/index.js'

export const RESTAURANT = 'rest-1'
export const BRANCH = 'branch-1'
export const SUPER_PIN = '123456'

export interface Harness {
  app: ReturnType<typeof createApp>
  db: Db
  signer: Signer
  config: Config
  clock: { t: number }
  superId: string
  req(method: string, path: string, opts?: { body?: unknown; device?: string; bearer?: string; headers?: Record<string, string> }): Promise<Response>
  pair(): Promise<string>
  addUser(name: string, role: Role, pin?: string, extra?: { cocinaOperar?: boolean; branchId?: string }): Promise<string>
  login(userId: string, pin: string, device: string): Promise<Response>
}

export async function makeHarness(overrides: Partial<Config> = {}): Promise<Harness> {
  const config: Config = {
    ...loadConfig({ DATA_DIR: '/nonexistent', CREW_AUTH_ORIGINS: 'https://crew.example' }),
    rateLimit: { ...DEFAULTS.rateLimit, loginPerIp: 1000, loginPerDevice: 1000, pairPerIp: 1000 },
    ...overrides,
  }
  const db = openDb(':memory:')
  const signer = await createSigner(await generatePem(), config.issuer)
  const clock = { t: 1_800_000_000_000 }
  const app = createApp({ db, config, signer, now: () => clock.t })
  const superUser = await insertUser(db, clock.t, {
    branchId: BRANCH,
    restaurantId: RESTAURANT,
    name: 'Dueno',
    role: 'super',
    pin: SUPER_PIN,
    pinPepper: config.pinPepper,
  })

  const req: Harness['req'] = (method, path, opts = {}) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) }
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (opts.device) headers['x-device-token'] = opts.device
    if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`
    return Promise.resolve(
      app.request(path, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }),
    )
  }

  const pair = async () => {
    const { code } = insertPairingCode(db, clock.t, config.pairingTtlMs, {
      branchId: BRANCH,
      deviceName: 'Caja',
      createdBy: superUser.id,
    })
    const res = await req('POST', '/v1/devices/pair', { body: { pairingCode: code } })
    return ((await res.json()) as { deviceToken: string }).deviceToken
  }

  return {
    app,
    db,
    signer,
    config,
    clock,
    superId: superUser.id,
    req,
    pair,
    addUser: async (name, role, pin = '1234', extra = {}) =>
      (await insertUser(db, clock.t, { branchId: extra.branchId ?? BRANCH, restaurantId: RESTAURANT, name, role, pin, pinPepper: config.pinPepper, cocinaOperar: extra.cocinaOperar })).id,
    login: (userId, pin, device) => req('POST', '/v1/login', { body: { userId, pin }, device }),
  }
}

export async function loginOk(h: Harness, userId: string, pin: string, device: string) {
  const res = await h.login(userId, pin, device)
  if (res.status !== 200) throw new Error(`login fallo: ${res.status}`)
  return (await res.json()) as {
    accessToken: string
    refreshToken: string
    expiresIn: number
    user: { id: string; role: string; permissions: string[] }
  }
}

// Integracion end-to-end: el servicio real (Hono + SQLite en memoria, puerto
// efimero) contra el cliente real de apps/crew (localClient + localSession).
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalClient, CrewAuthError } from '../../crew/src/lib/auth/localClient'
import type { LocalClient } from '../../crew/src/lib/auth/localClient'
import { DEVICE_KEY, SESSION_KEY, createLocalAuth } from '../../crew/src/lib/auth/localSession'
import { memoryStorage } from '../../crew/src/lib/auth/testUtils'
import { createApp } from '../src/app'
import { createSuperUser } from '../src/cli/createSuper'
import { createSigner, generatePem } from '../src/auth/tokens'
import { loadConfig } from '../src/config'
import { openDb } from '../src/db/index'
import { insertPairingCode } from '../src/db/pairing'
import type { Db } from '../src/db/index'

const BRANCH = 'sucursal-1'
const RESTAURANT = 'rest-1'
const SUPER_PIN = '123456'

// Reloj del servidor (el del cliente se desplaza aparte con ctx.clock para forzar refreshes).
const serverClock = { v: 0 }

let db: Db
let server: ReturnType<typeof serve>
let client: LocalClient
let baseUrl: string

const stored = <T>(storage: Storage, key: string) => JSON.parse(storage.getItem(key) ?? 'null') as T
const status = async (p: Promise<unknown>) => {
  try {
    await p
    return 200
  } catch (e) {
    if (e instanceof CrewAuthError) return e.status
    throw e
  }
}

beforeAll(async () => {
  const config = loadConfig({ DATA_DIR: '/nonexistent', CREW_AUTH_ORIGINS: 'https://crew.example' })
  db = openDb(':memory:')
  const signer = await createSigner(await generatePem(), config.issuer)
  const app = createApp({ db, config, signer, now: () => Date.now() + serverClock.v })
  server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  client = createLocalClient({ baseUrl })
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  db.close()
})

// Estado compartido entre pasos: el flujo es una sola historia.
const ctx = {} as {
  superId: string
  storage: Storage
  auth: ReturnType<typeof createLocalAuth>
  clock: { offset: number }
  meseroId: string
  meseroPin: string
}

describe('crew-auth + cliente de Crew, extremo a extremo', () => {
  it('create-super + codigo de emparejamiento, y emparejar el dispositivo (un solo uso)', async () => {
    const created = await createSuperUser(db, { branchId: BRANCH, restaurantId: RESTAURANT, name: 'Dueno', pin: SUPER_PIN })
    ctx.superId = created.id
    const { code } = insertPairingCode(db, Date.now(), 10 * 60_000, {
      branchId: BRANCH,
      deviceName: 'Caja',
      createdBy: created.id,
    })

    ctx.storage = memoryStorage()
    ctx.clock = { offset: 0 }
    ctx.auth = createLocalAuth({ client, storage: ctx.storage, now: () => Date.now() + ctx.clock.offset })
    await ctx.auth.pair(code)
    expect(ctx.auth.getSnapshot()).toMatchObject({ paired: true, branchId: BRANCH, status: 'signedOut' })
    expect(stored<{ deviceToken: string }>(ctx.storage, DEVICE_KEY).deviceToken.length).toBeGreaterThan(20)

    // El codigo ya se uso.
    expect(await status(createLocalClient({ baseUrl }).pair(code))).toBe(401)
  })

  it('lista los usuarios del selector (solo id, nombre y rol)', async () => {
    const users = await ctx.auth.listUsers()
    expect(users).toEqual([{ id: ctx.superId, name: 'Dueno', role: 'super' }])
  })

  it('login con PIN: PIN malo 401, PIN bueno abre sesion con permisos de super', async () => {
    await expect(ctx.auth.login(ctx.superId, '000000')).rejects.toMatchObject({ status: 401 })
    expect(ctx.auth.getSnapshot().status).toBe('signedOut')

    await ctx.auth.login(ctx.superId, SUPER_PIN)
    const snap = ctx.auth.getSnapshot()
    expect(snap.status).toBe('signedIn')
    expect(snap.user).toMatchObject({ id: ctx.superId, name: 'Dueno', role: 'super' })
    expect(snap.user?.permissions).toContain('usuarios.administrar')
    ctx.auth.stop()
  })

  it('refresh rotativo: token nuevo, el access nuevo funciona', async () => {
    const before = stored<{ refreshToken: string }>(ctx.storage, SESSION_KEY).refreshToken
    const oldAccess = (await ctx.auth.getToken())!
    serverClock.v = 2_000 // pasan unos segundos: el access nuevo lleva otro iat
    ctx.clock.offset = 15 * 60_000 - 5_000 // el access esta por vencer
    const fresh = (await ctx.auth.getToken())!
    ctx.clock.offset = 0
    serverClock.v = 0
    ctx.auth.stop()

    expect(fresh).not.toBe(oldAccess)
    const after = stored<{ refreshToken: string; name: string }>(ctx.storage, SESSION_KEY)
    expect(after.refreshToken).not.toBe(before)
    expect(after.name).toBe('Dueno')
    expect((await client.adminListUsers(fresh, BRANCH)).map((u) => u.name)).toEqual(['Dueno'])
    // El sid es estable entre rotaciones: el access anterior (de otra pestana) sigue valiendo.
    expect(await status(client.adminListUsers(oldAccess, BRANCH))).toBe(200)
    ctx.storage.setItem('prev_refresh', before)
  })

  it('reusar un refresh ya rotado: dentro de 10 s recibe la misma respuesta; despues revoca las sesiones del dispositivo', async () => {
    const { deviceToken } = stored<{ deviceToken: string }>(ctx.storage, DEVICE_KEY)
    const old = ctx.storage.getItem('prev_refresh')!
    const live = (await ctx.auth.getToken())!
    expect(await status(client.adminListUsers(live, BRANCH))).toBe(200)

    // Ventana de gracia: la rotacion acaba de ocurrir, es un reintento legitimo (respuesta perdida).
    const graced = await client.refresh(deviceToken, old)
    expect(graced.refreshToken).toBe(stored<{ refreshToken: string }>(ctx.storage, SESSION_KEY).refreshToken)
    expect(await status(client.adminListUsers(live, BRANCH))).toBe(200)

    // Pasada la ventana es robo: 401 y cae todo lo del usuario en el dispositivo.
    serverClock.v = 13_000
    expect(await status(client.refresh(deviceToken, old))).toBe(401)
    serverClock.v = 0
    // La sesion vigente tambien cayo.
    expect(await status(client.adminListUsers(live, BRANCH))).toBe(401)
    expect(await status(client.refresh(deviceToken, stored<{ refreshToken: string }>(ctx.storage, SESSION_KEY).refreshToken))).toBe(401)

    // El controlador lo detecta y pide PIN de nuevo.
    ctx.clock.offset = 15 * 60_000 - 5_000
    expect(await ctx.auth.getToken()).toBeNull()
    ctx.clock.offset = 0
    expect(ctx.auth.getSnapshot()).toMatchObject({ status: 'signedOut', paired: true })
    expect(ctx.storage.getItem(SESSION_KEY)).toBeNull()

    await ctx.auth.login(ctx.superId, SUPER_PIN)
    expect(ctx.auth.getSnapshot().status).toBe('signedIn')
    ctx.auth.stop()
  })

  it('el super crea un mesero, lo ve en la lista admin y emite un codigo para otro dispositivo', async () => {
    const token = (await ctx.auth.getToken())!
    ctx.meseroPin = '4321'
    const created = await client.adminCreateUser(token, { branchId: BRANCH, name: 'Maria', role: 'mesero', pin: ctx.meseroPin })
    ctx.meseroId = created.id
    expect(created).toMatchObject({ name: 'Maria', role: 'mesero', active: true, branchId: BRANCH })

    const all = await client.adminListUsers(token, BRANCH)
    expect(all.map((u) => u.name).sort()).toEqual(['Dueno', 'Maria'])

    // Desactivar y reactivar: la lista admin incluye inactivos, el selector no.
    await client.adminUpdateUser(token, created.id, { active: false })
    expect((await client.adminListUsers(token, BRANCH)).find((u) => u.id === created.id)?.active).toBe(false)
    expect((await ctx.auth.listUsers()).map((u) => u.name)).toEqual(['Dueno'])
    await client.adminUpdateUser(token, created.id, { active: true })

    const pc = await client.adminCreatePairingCode(token, BRANCH)
    expect(pc.code).toMatch(/^[A-Z0-9]{8}$/)
    expect(pc.expiresAt).toBeGreaterThan(Date.now())
    ;(ctx as Record<string, unknown>).code2 = pc.code
  })

  it('login de mesero en otro dispositivo; no puede administrar usuarios (403)', async () => {
    const storage = memoryStorage()
    const mesero = createLocalAuth({ client, storage })
    await mesero.pair((ctx as unknown as { code2: string }).code2)
    expect((await mesero.listUsers()).map((u) => u.name).sort()).toEqual(['Dueno', 'Maria'])

    await mesero.login(ctx.meseroId, ctx.meseroPin)
    const snap = mesero.getSnapshot()
    expect(snap.user).toMatchObject({ role: 'mesero', name: 'Maria' })
    expect(snap.user?.permissions).toEqual(['mesas.ver', 'comanda.crear', 'cuenta.ver', 'cuenta.cobrar'])

    const token = (await mesero.getToken())!
    expect(await status(client.adminListUsers(token, BRANCH))).toBe(403)
    expect(await status(client.adminCreateUser(token, { branchId: BRANCH, name: 'X', role: 'super', pin: '1111' }))).toBe(403)
    expect(await status(client.adminResetPin(token, ctx.superId, '9999'))).toBe(403)
    expect(await status(client.adminCreatePairingCode(token, BRANCH))).toBe(403)

    // Logout: el refresh token y el access dejan de valer.
    const { deviceToken } = stored<{ deviceToken: string }>(storage, DEVICE_KEY)
    const rt = stored<{ refreshToken: string }>(storage, SESSION_KEY).refreshToken
    await mesero.signOut()
    expect(mesero.getSnapshot()).toMatchObject({ status: 'signedOut', paired: true })
    expect(storage.getItem(SESSION_KEY)).toBeNull()
    expect(await status(client.refresh(deviceToken, rt))).toBe(401)
    expect(await status(client.adminListUsers(token, BRANCH))).toBe(401)
  })

  it('reset-pin: el PIN viejo deja de servir y se cierran las sesiones del usuario', async () => {
    const token = (await ctx.auth.getToken())!
    await client.adminResetPin(token, ctx.meseroId, '8765')
    const { deviceToken } = stored<{ deviceToken: string }>(ctx.storage, DEVICE_KEY)
    expect(await status(client.login(deviceToken, ctx.meseroId, ctx.meseroPin))).toBe(401)
    expect(await status(client.login(deviceToken, ctx.meseroId, '8765'))).toBe(200)
  })

  it('lockout tras 5 PIN malos: responde 401 generico, tambien con el PIN correcto', async () => {
    const { deviceToken } = stored<{ deviceToken: string }>(ctx.storage, DEVICE_KEY)
    for (let i = 0; i < 5; i++) expect(await status(client.login(deviceToken, ctx.meseroId, '0000'))).toBe(401)
    expect(await status(client.login(deviceToken, ctx.meseroId, '8765'))).toBe(401)
  })

  it('el super ve el bloqueo y lo quita sin cambiar el PIN; el PIN de un super exige 6 digitos', async () => {
    const token = (await ctx.auth.getToken())!
    const { deviceToken } = stored<{ deviceToken: string }>(ctx.storage, DEVICE_KEY)
    const locked = (await client.adminListUsers(token, BRANCH)).find((u) => u.id === ctx.meseroId)!
    expect(locked.lockedUntil).toBeGreaterThan(Date.now())
    expect(await status(client.login(deviceToken, ctx.meseroId, '8765'))).toBe(401)

    await client.adminUnlockUser(token, ctx.meseroId)
    expect((await client.adminListUsers(token, BRANCH)).find((u) => u.id === ctx.meseroId)?.lockedUntil).toBeNull()
    expect(await status(client.login(deviceToken, ctx.meseroId, '8765'))).toBe(200)

    expect(await status(client.adminCreateUser(token, { branchId: BRANCH, name: 'Socio', role: 'super', pin: '12345' }))).toBe(400)
    expect(await status(client.adminCreateUser(token, { branchId: BRANCH, name: 'Socio', role: 'super', pin: '123456' }))).toBe(200)
  })

  it('dispositivo desconocido: la lista y el login dan 401', async () => {
    expect(await status(client.listUsers('token-inexistente', BRANCH))).toBe(401)
    expect(await status(client.login('token-inexistente', ctx.superId, SUPER_PIN))).toBe(401)
  })

  it('el super revoca un dispositivo: pierde sesion, login y token; el resto sigue', async () => {
    const token = (await ctx.auth.getToken())!
    const before = new Set((await client.adminListDevices(token)).map((d) => d.id))
    const { code } = await client.adminCreatePairingCode(token, BRANCH)
    const robado = createLocalAuth({ client, storage: memoryStorage() })
    await robado.pair(code)
    await robado.login(ctx.superId, SUPER_PIN)
    const robadoAccess = (await robado.getToken())!

    const devices = await client.adminListDevices(token)
    expect(devices.length).toBeGreaterThanOrEqual(2)
    expect(devices.filter((d) => d.current)).toHaveLength(1)
    const victim = devices.find((d) => !before.has(d.id))!
    expect(victim).toBeDefined()
    expect(victim.current).toBe(false)

    await client.adminRevokeDevice(token, victim.id)
    expect((await client.adminListDevices(token)).map((d) => d.id)).not.toContain(victim.id)

    // Sus sesiones y su token ya no sirven.
    expect(await status(client.adminListUsers(robadoAccess, BRANCH))).toBe(401)
    await expect(robado.listUsers()).rejects.toMatchObject({ status: 401 })
    expect(robado.getSnapshot()).toMatchObject({ paired: false, status: 'signedOut' })
    await expect(robado.login(ctx.superId, SUPER_PIN)).rejects.toMatchObject({ status: 401 })
    // El dispositivo del super sigue operativo.
    expect((await ctx.auth.listUsers()).length).toBeGreaterThan(0)
    expect(await status(client.adminListDevices(token))).toBe(200)
    robado.stop()
  })

  it('si se pierde la respuesta del refresh, el reintento con el token viejo no cierra la sesion', async () => {
    let dropped = 0
    const lossy = createLocalClient({
      baseUrl,
      fetchImpl: async (input, init) => {
        const res = await fetch(input, init) // el servidor SI rota...
        if (String(input).endsWith('/v1/refresh') && dropped === 0) {
          dropped += 1
          throw new TypeError('connection reset') // ...pero la respuesta no llega
        }
        return res
      },
    })
    const rt = stored<{ refreshToken: string }>(ctx.storage, SESSION_KEY).refreshToken
    const tab = createLocalAuth({ client: lossy, storage: ctx.storage, startRetryDelaysMs: [10, 10] })
    await tab.start()
    expect(dropped).toBe(1)
    expect(tab.getSnapshot().status).toBe('signedIn') // sin pedir PIN de nuevo
    expect(stored<{ refreshToken: string }>(ctx.storage, SESSION_KEY).refreshToken).not.toBe(rt)
    expect(await status(client.adminListUsers((await tab.getToken())!, BRANCH))).toBe(200)
    tab.stop()
  })

  it('dos pestanas (mismo storage) que recargan a la vez no se invalidan por la rotacion', async () => {
    const off = { v: 0 }
    const tabs = [
      ctx.auth,
      createLocalAuth({ client, storage: ctx.storage }),
      createLocalAuth({ client, storage: ctx.storage, now: () => Date.now() + off.v }),
    ]
    expect(tabs[1]!.getSnapshot().status).toBe('loading')
    await Promise.all(tabs.map((t) => t.start()))
    await new Promise((r) => setTimeout(r, 100)) // difusion del access token entre pestanas
    for (const t of tabs) {
      expect(t.getSnapshot().status).toBe('signedIn')
      expect(await status(client.adminListUsers((await t.getToken())!, BRANCH))).toBe(200)
    }
    // Una rotacion forzada desde una pestana: las demas adoptan el token nuevo.
    off.v = 15 * 60_000 - 5_000
    const rotated = (await tabs[2]!.getToken())!
    off.v = 0
    await new Promise((r) => setTimeout(r, 100))
    for (const t of tabs) {
      expect(t.getSnapshot().status).toBe('signedIn')
      expect(await t.getToken()).toBe(rotated)
    }
    expect(await status(client.adminListUsers(rotated, BRANCH))).toBe(200)
    for (const t of tabs) t.stop()
  })

  it('al recargar sin red reintenta el refresh con backoff antes de pedir PIN', async () => {
    let calls = 0
    const flaky = createLocalClient({
      baseUrl,
      fetchImpl: (input, init) => {
        calls += 1
        return calls <= 2 ? Promise.reject(new TypeError('offline')) : fetch(input, init)
      },
    })
    const tab = createLocalAuth({ client: flaky, storage: ctx.storage, startRetryDelaysMs: [10, 10, 10] })
    // Estado de pestana recien cargada: sesion guardada, sin access token.
    expect(tab.getSnapshot().status).toBe('loading')
    await tab.start()
    expect(calls).toBe(3)
    expect(tab.getSnapshot().status).toBe('signedIn')
    tab.stop()
  })

  it('super hace logout', async () => {
    const token = (await ctx.auth.getToken())!
    await ctx.auth.signOut()
    expect(ctx.auth.getSnapshot().status).toBe('signedOut')
    expect(await status(client.adminListUsers(token, BRANCH))).toBe(401)
  })
})

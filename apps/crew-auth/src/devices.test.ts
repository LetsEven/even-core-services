import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './config.js'
import { migrate } from './db/index.js'
import { migrations } from './db/migrations/index.js'
import { insertPairingCode } from './db/pairing.js'
import { insertUser } from './db/users.js'
import { BRANCH, SUPER_PIN, loginOk, makeHarness } from './test/helpers.js'
import type { Harness } from './test/helpers.js'

const DAY = 86_400_000

type DeviceDto = { id: string; name: string; branchId: string; lastSeenAt: number | null; expiresAt: number; current: boolean }

async function foreignDevice(h: Harness): Promise<string> {
  const other = await insertUser(h.db, h.clock.t, {
    branchId: 'b-otro',
    restaurantId: 'rest-otro',
    name: 'Otro dueno',
    role: 'super',
    pin: '654321',
    pinPepper: h.config.pinPepper,
  })
  const { code } = insertPairingCode(h.db, h.clock.t, h.config.pairingTtlMs, {
    branchId: 'b-otro',
    deviceName: 'Caja ajena',
    createdBy: other.id,
  })
  const res = await h.req('POST', '/v1/devices/pair', { body: { pairingCode: code } })
  return ((await res.json()) as { deviceToken: string }).deviceToken
}

describe('GET /v1/devices', () => {
  it('lista solo los dispositivos del restaurante del super, sin el hash del token', async () => {
    const h = await makeHarness()
    const dev = await h.pair()
    await h.pair()
    await foreignDevice(h)
    const sup = await loginOk(h, h.superId, SUPER_PIN, dev)
    const res = await h.req('GET', '/v1/devices', { bearer: sup.accessToken })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toMatch(/token|hash/i)
    const { devices } = JSON.parse(text) as { devices: DeviceDto[] }
    expect(devices).toHaveLength(2)
    expect(devices.every((d) => d.branchId === BRANCH)).toBe(true)
    expect(devices.filter((d) => d.current)).toHaveLength(1)
    expect(devices[0]?.expiresAt).toBeGreaterThan(h.clock.t)
  })

  it('exige super: otros roles 403, sin token 401', async () => {
    const h = await makeHarness()
    const dev = await h.pair()
    const id = await h.addUser('Ana', 'cajero')
    const ana = await loginOk(h, id, '1234', dev)
    expect((await h.req('GET', '/v1/devices', { bearer: ana.accessToken })).status).toBe(403)
    expect((await h.req('DELETE', `/v1/devices/${id}`, { bearer: ana.accessToken })).status).toBe(403)
    expect((await h.req('GET', '/v1/devices')).status).toBe(401)
    expect((await h.req('DELETE', `/v1/devices/${id}`)).status).toBe(401)
  })
})

describe('DELETE /v1/devices/:id', () => {
  it('revoca el dispositivo y todas sus sesiones; el resto sigue vivo', async () => {
    const h = await makeHarness()
    const caja = await h.pair()
    const robado = await h.pair()
    const ana = await h.addUser('Ana', 'mesero')
    const sup = await loginOk(h, h.superId, SUPER_PIN, caja)
    const sessionA = await loginOk(h, ana, '1234', robado)
    const sessionB = await loginOk(h, h.superId, SUPER_PIN, robado)

    const list = (await (await h.req('GET', '/v1/devices', { bearer: sup.accessToken })).json()) as { devices: DeviceDto[] }
    const stolen = list.devices.find((d) => !d.current)!
    const del = await h.req('DELETE', `/v1/devices/${stolen.id}`, { bearer: sup.accessToken })
    expect(del.status).toBe(200)

    expect((await h.req('GET', '/v1/users', { device: robado })).status).toBe(401)
    expect((await h.login(ana, '1234', robado)).status).toBe(401)
    expect((await h.req('POST', '/v1/refresh', { body: { refreshToken: sessionA.refreshToken }, device: robado })).status).toBe(401)
    expect((await h.req('GET', '/v1/devices', { bearer: sessionB.accessToken })).status).toBe(401)
    // El dispositivo legitimo no se toca.
    expect((await h.req('GET', '/v1/devices', { bearer: sup.accessToken })).status).toBe(200)
    expect((await h.login(ana, '1234', caja)).status).toBe(200)
    // Ya no aparece en la lista y revocar dos veces da 404.
    const after = (await (await h.req('GET', '/v1/devices', { bearer: sup.accessToken })).json()) as { devices: DeviceDto[] }
    expect(after.devices.map((d) => d.id)).not.toContain(stolen.id)
    expect((await h.req('DELETE', `/v1/devices/${stolen.id}`, { bearer: sup.accessToken })).status).toBe(404)

    const audit = (await (await h.req('GET', '/v1/audit?action=device.revoke', { bearer: sup.accessToken })).json()) as {
      events: { target: string }[]
    }
    expect(audit.events.map((e) => e.target)).toEqual([stolen.id])
  })

  it('no toca dispositivos de otro restaurante (404) ni ids inexistentes', async () => {
    const h = await makeHarness()
    const dev = await h.pair()
    const foreign = await foreignDevice(h)
    const sup = await loginOk(h, h.superId, SUPER_PIN, dev)
    const id = (h.db.prepare("SELECT id FROM devices WHERE branch_id = 'b-otro'").get() as { id: string }).id
    expect((await h.req('DELETE', `/v1/devices/${id}`, { bearer: sup.accessToken })).status).toBe(404)
    expect((await h.req('DELETE', '/v1/devices/no-existe', { bearer: sup.accessToken })).status).toBe(404)
    expect((await h.req('GET', '/v1/users', { device: foreign })).status).toBe(200)
  })

  it('un super puede revocar el dispositivo en el que esta y se queda sin sesion', async () => {
    const h = await makeHarness()
    const dev = await h.pair()
    const sup = await loginOk(h, h.superId, SUPER_PIN, dev)
    const { devices } = (await (await h.req('GET', '/v1/devices', { bearer: sup.accessToken })).json()) as { devices: DeviceDto[] }
    expect((await h.req('DELETE', `/v1/devices/${devices[0]!.id}`, { bearer: sup.accessToken })).status).toBe(200)
    expect((await h.req('GET', '/v1/devices', { bearer: sup.accessToken })).status).toBe(401)
  })
})

describe('expiracion del token de dispositivo', () => {
  it('vence a los 90 dias sin uso y el login lo renueva', async () => {
    const h = await makeHarness()
    expect(DEFAULTS.deviceTtlMs).toBe(90 * DAY)
    const renewed = await h.pair()
    const idle = await h.pair()

    h.clock.t += 60 * DAY
    expect((await h.login(h.superId, SUPER_PIN, renewed)).status).toBe(200) // renueva: vence en el dia 150
    h.clock.t += 60 * DAY // dia 120
    expect((await h.req('GET', '/v1/users', { device: renewed })).status).toBe(200)
    expect((await h.req('GET', '/v1/users', { device: idle })).status).toBe(401)
    expect((await h.login(h.superId, SUPER_PIN, idle)).status).toBe(401)
    h.clock.t += 31 * DAY // dia 151
    expect((await h.req('GET', '/v1/users', { device: renewed })).status).toBe(401)
  })

  it('un login fallido no renueva la vigencia', async () => {
    const h = await makeHarness()
    const dev = await h.pair()
    h.clock.t += 80 * DAY
    expect((await h.login(h.superId, '000000', dev)).status).toBe(401)
    h.clock.t += 11 * DAY
    expect((await h.req('GET', '/v1/users', { device: dev })).status).toBe(401)
  })
})

describe('migracion 002', () => {
  it('rellena restaurante y vencimiento de dispositivos y codigos existentes', async () => {
    // Base en version 1 con datos, luego se migra.
    const old = (await import('better-sqlite3')).default(':memory:')
    old.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)')
    old.exec(migrations[0]!.sql)
    old.prepare("INSERT INTO schema_migrations VALUES (1, 'init', 0)").run()
    const t = Date.now()
    old
      .prepare(
        `INSERT INTO users (id, branch_id, restaurant_id, name, role, pin_hash, pin_salt, created_at, updated_at)
         VALUES ('u1', 'b1', 'r1', 'Dueno', 'super', 'h', 's', ?, ?)`,
      )
      .run(t, t)
    old.prepare("INSERT INTO devices (id, branch_id, name, token_hash, created_at, updated_at) VALUES ('d1', 'b1', 'Caja', 'x', ?, ?)").run(t, t)
    old
      .prepare(
        "INSERT INTO pairing_codes (id, code_hash, branch_id, device_name, created_by, expires_at, created_at, updated_at) VALUES ('p1', 'y', 'b1', 'Caja', 'u1', ?, ?, ?)",
      )
      .run(t, t, t)
    migrate(old)
    const d = old.prepare('SELECT restaurant_id, expires_at, revoked_at FROM devices').get() as {
      restaurant_id: string
      expires_at: number
      revoked_at: number | null
    }
    expect(d.restaurant_id).toBe('r1')
    expect(d.revoked_at).toBeNull()
    expect(d.expires_at).toBeGreaterThan(t + 89 * DAY)
    expect(old.prepare('SELECT restaurant_id FROM pairing_codes').get()).toEqual({ restaurant_id: 'r1' })
    old.close()
  })
})

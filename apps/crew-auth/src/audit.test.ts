import { describe, expect, it } from 'vitest'
import { migrate } from './db/index.js'
import { migrations } from './db/migrations/index.js'
import { insertPairingCode } from './db/pairing.js'
import { insertUser } from './db/users.js'
import { SUPER_PIN, loginOk, makeHarness } from './test/helpers.js'
import type { Harness } from './test/helpers.js'

type Ev = { action: string; target: string | null; actorId: string | null; ip: string | null }
const events = async (h: Harness, bearer: string, qs = '?limit=200') =>
  ((await (await h.req('GET', `/v1/audit${qs}`, { bearer })).json()) as { events: Ev[] }).events

// Segundo restaurante con su super y su dispositivo.
async function otherRestaurant(h: Harness) {
  const sup = await insertUser(h.db, h.clock.t, {
    branchId: 'b-otro', restaurantId: 'rest-otro', name: 'Otro dueno', role: 'super', pin: '654321',
  })
  const { code } = insertPairingCode(h.db, h.clock.t, h.config.pairingTtlMs, {
    branchId: 'b-otro', deviceName: 'Caja ajena', createdBy: sup.id,
  })
  const device = ((await (await h.req('POST', '/v1/devices/pair', { body: { pairingCode: code } })).json()) as { deviceToken: string }).deviceToken
  return { sup, device }
}

describe('GET /v1/audit filtra por restaurante', () => {
  it('no filtra eventos sin actor de otros restaurantes (usuario desconocido, login fallido)', async () => {
    const h = await makeHarness()
    const mine = await h.pair()
    const other = await otherRestaurant(h)

    // Eventos SIN actor: un id inexistente desde cada restaurante.
    await h.login('fantasma-nuestro', '123456', mine)
    await h.login('fantasma-ajeno', '123456', other.device)
    await h.login(other.sup.id, '000000', other.device) // fallo con actor ajeno
    // Intento de emparejamiento anonimo: no atribuible a ningun restaurante.
    await h.req('POST', '/v1/devices/pair', { body: { pairingCode: 'ZZZZZZZZ' } })

    const sup = await loginOk(h, h.superId, SUPER_PIN, mine)
    const seen = await events(h, sup.accessToken)
    expect(seen.map((e) => e.target)).toContain('fantasma-nuestro')
    expect(seen.map((e) => e.target)).not.toContain('fantasma-ajeno')
    expect(seen.map((e) => e.target)).not.toContain(other.sup.id)
    expect(seen.some((e) => e.action === 'device.pair_fail')).toBe(false)
    // Y todo lo visible pertenece a este restaurante.
    const rows = h.db.prepare("SELECT DISTINCT restaurant_id FROM audit_log WHERE action = 'login.fail' ORDER BY 1").all()
    expect(rows).toEqual([{ restaurant_id: 'rest-1' }, { restaurant_id: 'rest-otro' }])

    // El otro super ve lo suyo y nada nuestro.
    const theirs = await loginOk(h, other.sup.id, '654321', other.device)
    const theirSeen = await events(h, theirs.accessToken)
    expect(theirSeen.map((e) => e.target)).toContain('fantasma-ajeno')
    expect(theirSeen.map((e) => e.target)).not.toContain('fantasma-nuestro')
    expect(theirSeen.map((e) => e.target)).not.toContain(h.superId)
  })

  it('todos los eventos nuevos llevan restaurante (login, refresh, logout, admin, dispositivos)', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    await h.req('POST', '/v1/refresh', { body: { refreshToken: s.refreshToken }, device })
    await h.req('POST', '/v1/users', { bearer: s.accessToken, body: { name: 'N', role: 'mesero', pin: '1234' } })
    await h.req('POST', '/v1/devices/pairing-codes', { bearer: s.accessToken, body: {} })
    await h.login('no-existe', '123456', device)
    const nulls = h.db.prepare('SELECT action FROM audit_log WHERE restaurant_id IS NULL').all()
    expect(nulls).toEqual([])
  })

  it('sigue filtrando por action y paginando con before', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    for (let i = 0; i < 3; i++) {
      h.clock.t += 1000
      await h.login(h.superId, '000000', device)
    }
    const fails = await events(h, s.accessToken, '?action=login.fail')
    expect(fails).toHaveLength(3)
    expect(fails.every((e) => e.action === 'login.fail')).toBe(true)
    const before = (await (await h.req('GET', '/v1/audit?action=login.fail&limit=1', { bearer: s.accessToken })).json()) as {
      events: { at: number }[]
    }
    const page2 = await events(h, s.accessToken, `?action=login.fail&before=${before.events[0]!.at}`)
    expect(page2).toHaveLength(2)
  })
})

describe('migracion 005', () => {
  it('atribuye eventos antiguos por actor o por dispositivo y deja NULL lo no atribuible', async () => {
    const old = (await import('better-sqlite3')).default(':memory:')
    old.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)')
    for (const m of migrations.slice(0, 4)) {
      old.exec(m.sql)
      old.prepare('INSERT INTO schema_migrations VALUES (?, ?, 0)').run(m.version, m.name)
    }
    const t = 1_800_000_000_000
    old
      .prepare("INSERT INTO users (id, branch_id, restaurant_id, name, role, pin_hash, pin_salt, created_at, updated_at) VALUES ('u', 'b', 'r1', 'D', 'super', 'h', 's', ?, ?)")
      .run(t, t)
    old
      .prepare("INSERT INTO devices (id, branch_id, restaurant_id, name, token_hash, created_at, updated_at) VALUES ('d', 'b', 'r1', 'C', 'x', ?, ?)")
      .run(t, t)
    const ins = old.prepare('INSERT INTO audit_log (id, at, actor_id, action, meta_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    ins.run('a1', t, 'u', 'login.ok', null, t, t)
    ins.run('a2', t, null, 'login.fail', JSON.stringify({ deviceId: 'd' }), t, t)
    ins.run('a3', t, null, 'device.pair_fail', JSON.stringify({ count: 3 }), t, t)
    migrate(old)
    const rows = old.prepare('SELECT id, restaurant_id FROM audit_log ORDER BY id').all()
    expect(rows).toEqual([
      { id: 'a1', restaurant_id: 'r1' },
      { id: 'a2', restaurant_id: 'r1' },
      { id: 'a3', restaurant_id: null },
    ])
    old.close()
  })
})

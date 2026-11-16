import { describe, expect, it } from 'vitest'
import { SUPER_PIN, loginOk, makeHarness } from './test/helpers.js'
import type { Harness } from './test/helpers.js'

const MIN = 60_000
const BAD = '9999'

const attempts = (h: Harness, id: string) =>
  h.db.prepare('SELECT failed_attempts AS n, lock_count AS l FROM users WHERE id = ?').get(id) as { n: number; l: number }
const deviceRow = (h: Harness, id: string) =>
  h.db.prepare('SELECT failed_attempts AS n, lock_count AS l, locked_until AS until FROM user_device_attempts WHERE user_id = ?').all(id) as {
    n: number
    l: number
    until: number | null
  }[]
const auditActions = (h: Harness, action: string) =>
  h.db.prepare('SELECT meta_json FROM audit_log WHERE action = ? ORDER BY rowid').all(action) as { meta_json: string | null }[]

describe('reserva atomica del intento', () => {
  it('con peticiones en paralelo no se verifican mas de 5 PIN por ciclo, ni siquiera el correcto', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    const pins = [BAD, BAD, BAD, BAD, '1234', BAD, BAD, BAD, BAD, BAD, BAD, BAD]
    // El correcto va en 5o lugar: reservan los 5 primeros; el resto ya no se verifica.
    const results = await Promise.all(pins.map((p) => h.login(id, p, device)))
    const verified = h.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('login.fail','login.ok') AND target = ?").get(id) as { n: number }
    expect(verified.n).toBeLessThanOrEqual(5)
    expect(attempts(h, id).n).toBeLessThanOrEqual(5)
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1)
    // Tras el ciclo, el estado queda coherente: o bloqueado (5 fallos) o con sesion (reinicio).
    const after = await h.login(id, '1234', device)
    expect([200, 401]).toContain(after.status)
  })

  it('con el ciclo agotado no se verifica el PIN y el contador no sigue subiendo', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    for (let i = 0; i < 5; i++) expect((await h.login(id, BAD, device)).status).toBe(401)
    expect(attempts(h, id).n).toBe(5)
    for (let i = 0; i < 4; i++) expect((await h.login(id, '1234', device)).status).toBe(401)
    expect(attempts(h, id).n).toBe(5)
    expect(deviceRow(h, id)[0]?.n).toBe(5)
    // Respuesta identica a un PIN malo: no revela el bloqueo.
    const blocked = await h.login(id, '1234', device)
    const bad = await h.login('no-existe', BAD, device)
    expect(await blocked.json()).toEqual(await bad.json())
  })
})

describe('backoff exponencial sin reiniciar el contador', () => {
  it('15 min, 30 min, 60 min; el contador sigue acumulando', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')

    for (let cycle = 0; cycle < 3; cycle++) {
      const wait = 15 * MIN * 2 ** cycle
      for (let i = 0; i < 5; i++) expect((await h.login(id, BAD, device)).status).toBe(401)
      expect(deviceRow(h, id)[0]).toMatchObject({ n: 5 * (cycle + 1), l: cycle + 1 })
      h.clock.t += wait - 1
      expect((await h.login(id, '1234', device)).status, `ciclo ${cycle}: sigue bloqueado`).toBe(401)
      h.clock.t += 2
      if (cycle === 2) break
      // Ya vencio: se pueden intentar otros 5 (los fallos NO se reiniciaron al bloquear).
      expect(deviceRow(h, id)[0]?.n).toBe(5 * (cycle + 1))
    }
    expect((await h.login(id, '1234', device)).status).toBe(200)
  })

  it('un login exitoso reinicia contador y backoff', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    for (let i = 0; i < 5; i++) await h.login(id, BAD, device)
    h.clock.t += 15 * MIN + 1
    expect((await h.login(id, '1234', device)).status).toBe(200)
    expect(attempts(h, id)).toEqual({ n: 0, l: 0 })
    expect(deviceRow(h, id)).toEqual([])
    // El siguiente bloqueo vuelve a durar 15 min.
    for (let i = 0; i < 5; i++) await h.login(id, BAD, device)
    h.clock.t += 15 * MIN + 1
    expect((await h.login(id, '1234', device)).status).toBe(200)
  })
})

describe('umbral por dispositivo y por usuario', () => {
  it('bloquear en un dispositivo no bloquea al usuario en los demas', async () => {
    const h = await makeHarness()
    const a = await h.pair()
    const b = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    for (let i = 0; i < 5; i++) await h.login(id, BAD, a)
    expect((await h.login(id, '1234', a)).status).toBe(401)
    expect((await h.login(id, '1234', b)).status).toBe(200)
  })

  it('15 fallos repartidos entre dispositivos bloquean al usuario en todos; el super lo desbloquea sin cambiar el PIN', async () => {
    const h = await makeHarness()
    const devices = [await h.pair(), await h.pair(), await h.pair()]
    const fourth = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    // Ningun dispositivo supera su umbral de 5 antes del tercero: el global salta al fallo 15.
    for (const d of devices) for (let i = 0; i < 5; i++) await h.login(id, BAD, d)
    expect(attempts(h, id)).toEqual({ n: 15, l: 1 })
    expect((await h.login(id, '1234', fourth)).status).toBe(401)

    const locks = auditActions(h, 'user.locked').map((r) => JSON.parse(r.meta_json!) as { scope: string })
    expect(locks.filter((l) => l.scope === 'device')).toHaveLength(3)
    expect(locks.filter((l) => l.scope === 'user')).toHaveLength(1)
    expect(auditActions(h, 'login.blocked').length).toBeGreaterThan(0)

    const sup = await loginOk(h, h.superId, SUPER_PIN, fourth)
    const listed = (await (await h.req('GET', '/v1/admin/users', { bearer: sup.accessToken })).json()) as {
      users: { id: string; lockedUntil: number | null }[]
    }
    expect(listed.users.find((u) => u.id === id)?.lockedUntil).toBeGreaterThan(h.clock.t)

    const un = await h.req('POST', `/v1/users/${id}/unlock`, { bearer: sup.accessToken })
    expect(un.status).toBe(200)
    // Mismo PIN de siempre; sirve en cualquier dispositivo, incluso los que estaban bloqueados.
    expect((await h.login(id, '1234', devices[0]!)).status).toBe(200)
    expect((await h.login(id, '1234', fourth)).status).toBe(200)
    expect(auditActions(h, 'user.unlock')).toHaveLength(1)
  })

  it('un solo dispositivo no puede bloquear globalmente sin agotar tres ciclos de espera', async () => {
    const h = await makeHarness()
    const a = await h.pair()
    const b = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    for (let i = 0; i < 5; i++) await h.login(id, BAD, a)
    h.clock.t += 15 * MIN + 1
    for (let i = 0; i < 5; i++) await h.login(id, BAD, a)
    // 10 fallos globales: el usuario aun entra por otro dispositivo.
    expect(attempts(h, id).n).toBe(10)
    expect((await h.login(id, '1234', b)).status).toBe(200)
  })
})

describe('POST /v1/users/:id/unlock', () => {
  it('solo super y solo de su restaurante', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    const cajero = await h.addUser('Caja', 'cajero')
    const c = await loginOk(h, cajero, '1234', device)
    expect((await h.req('POST', `/v1/users/${id}/unlock`, { bearer: c.accessToken })).status).toBe(403)
    expect((await h.req('POST', `/v1/users/${id}/unlock`)).status).toBe(401)

    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    const { insertUser } = await import('./db/users.js')
    const foreign = await insertUser(h.db, h.clock.t, {
      branchId: 'x', restaurantId: 'otro', name: 'Ajeno', role: 'mesero', pin: '1234', pinPepper: h.config.pinPepper,
    })
    expect((await h.req('POST', `/v1/users/${foreign.id}/unlock`, { bearer: sup.accessToken })).status).toBe(404)
    expect((await h.req('POST', '/v1/users/no-existe/unlock', { bearer: sup.accessToken })).status).toBe(404)
  })

  it('reset-pin tambien limpia contadores y bloqueos', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    for (let i = 0; i < 5; i++) await h.login(id, BAD, device)
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    await h.req('POST', `/v1/users/${id}/reset-pin`, { bearer: sup.accessToken, body: { pin: '5678' } })
    expect(attempts(h, id)).toEqual({ n: 0, l: 0 })
    expect((await h.login(id, '5678', device)).status).toBe(200)
  })
})

describe('longitud del PIN por rol', () => {
  it('super: 6 a 8 digitos; el resto 4 a 8', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    const create = (role: string, pin: string) =>
      h.req('POST', '/v1/users', { bearer: sup.accessToken, body: { name: `${role}${pin}`, role, pin } })
    expect((await create('super', '12345')).status).toBe(400)
    expect((await create('super', '123456')).status).toBe(201)
    expect((await create('super', '12345678')).status).toBe(201)
    expect((await create('super', '123456789')).status).toBe(400)
    expect((await create('mesero', '123')).status).toBe(400)
    expect((await create('mesero', '1234')).status).toBe(201)
    expect((await create('cocina', '12345678')).status).toBe(201)
    expect((await create('cajero', '12ab')).status).toBe(400)
  })

  it('reset-pin respeta el rol del usuario y promover a super exige un PIN de 6+', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    const id = await h.addUser('Ana', 'mesero', '1234')
    const reset = (uid: string, pin: string) => h.req('POST', `/v1/users/${uid}/reset-pin`, { bearer: sup.accessToken, body: { pin } })
    expect((await reset(id, '4321')).status).toBe(200)

    const patch = (body: unknown) => h.req('PATCH', `/v1/users/${id}`, { bearer: sup.accessToken, body })
    expect((await patch({ role: 'super' })).status).toBe(400)
    expect((await patch({ role: 'super', pin: '1234' })).status).toBe(400)
    expect((await patch({ role: 'super', pin: '246810' })).status).toBe(200)
    expect((await loginOk(h, id, '246810', device)).user.role).toBe('super')
    expect((await reset(id, '1234')).status).toBe(400) // ya es super
    expect((await reset(id, '135790')).status).toBe(200)
  })
})

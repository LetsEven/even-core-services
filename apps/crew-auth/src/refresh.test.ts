import { decodeJwt } from 'jose'
import { describe, expect, it } from 'vitest'
import { migrate } from './db/index.js'
import { migrations } from './db/migrations/index.js'
import { SUPER_PIN, loginOk, makeHarness } from './test/helpers.js'
import type { Harness } from './test/helpers.js'

const HOUR = 3_600_000
const DAY = 24 * HOUR

type Tokens = { accessToken: string; refreshToken: string; expiresIn: number; user: { id: string } }
const refresh = (h: Harness, refreshToken: string, device: string | undefined) =>
  h.req('POST', '/v1/refresh', { body: { refreshToken }, device })
const logout = (h: Harness, refreshToken: string, device: string | undefined) =>
  h.req('POST', '/v1/logout', { body: { refreshToken }, device })
const audit = (h: Harness, action: string) =>
  (h.db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE action = ?').get(action) as { n: number }).n
const alive = async (h: Harness, accessToken: string) => (await h.req('GET', '/v1/devices', { bearer: accessToken })).status === 200

describe('refresh y logout exigen el dispositivo de la sesion', () => {
  it('sin X-Device-Token o con uno invalido: 401 y la sesion sigue viva', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    expect((await refresh(h, s.refreshToken, undefined)).status).toBe(401)
    expect((await refresh(h, s.refreshToken, 'falso')).status).toBe(401)
    expect((await logout(h, s.refreshToken, undefined)).status).toBe(401)
    expect(await alive(h, s.accessToken)).toBe(true)
    expect((await refresh(h, s.refreshToken, device)).status).toBe(200)
  })

  it('un refresh token usado desde OTRO dispositivo no sirve y no cierra la sesion legitima', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const other = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)

    expect((await refresh(h, s.refreshToken, other)).status).toBe(401)
    expect((await logout(h, s.refreshToken, other)).status).toBe(401)
    expect(audit(h, 'refresh.device_mismatch')).toBe(2)
    // La sesion no se toco.
    expect(await alive(h, s.accessToken)).toBe(true)
    const ok = await refresh(h, s.refreshToken, device)
    expect(ok.status).toBe(200)
    // Tampoco el refresh ya rotado sirve desde otro dispositivo (ni siquiera en la ventana de gracia).
    expect((await refresh(h, s.refreshToken, other)).status).toBe(401)
    expect(await alive(h, ((await ok.json()) as Tokens).accessToken)).toBe(true)
  })

  it('logout con el dispositivo correcto revoca la sesion; tambien con el refresh recien rotado', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    const r = (await (await refresh(h, s.refreshToken, device)).json()) as Tokens
    expect((await logout(h, s.refreshToken, device)).status).toBe(200) // el token viejo (otra pestana)
    expect(await alive(h, r.accessToken)).toBe(false)
    expect((await refresh(h, r.refreshToken, device)).status).toBe(401)
  })
})

describe('sid estable entre rotaciones', () => {
  it('el access token anterior sigue valiendo tras rotar (otras pestanas no reciben 401) y el sid no cambia', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    const r = (await (await refresh(h, s.refreshToken, device)).json()) as Tokens
    expect(decodeJwt(r.accessToken).sid).toBe(decodeJwt(s.accessToken).sid)
    expect(await alive(h, s.accessToken)).toBe(true)
    expect(await alive(h, r.accessToken)).toBe(true)
    expect(h.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 })
  })

  it('revocar la sesion (logout, reuso) corta TODOS los access tokens de esa sesion', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    const r = (await (await refresh(h, s.refreshToken, device)).json()) as Tokens
    await logout(h, r.refreshToken, device)
    expect(await alive(h, s.accessToken)).toBe(false)
    expect(await alive(h, r.accessToken)).toBe(false)
  })
})

describe('ventana de gracia del refresh rotado', () => {
  it('reusar el refresh recien rotado devuelve la misma respuesta y no revoca nada', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    const first = await refresh(h, s.refreshToken, device)
    const firstBody = await first.text()
    h.clock.t += 5_000
    const again = await refresh(h, s.refreshToken, device) // respuesta perdida: el cliente reintenta con el viejo
    expect(again.status).toBe(200)
    expect(await again.text()).toBe(firstBody)
    expect(audit(h, 'refresh.reuse')).toBe(0)

    // El refresh nuevo funciona y la sesion sigue viva.
    const next = (JSON.parse(firstBody) as Tokens).refreshToken
    const third = await refresh(h, next, device)
    expect(third.status).toBe(200)
    expect(await alive(h, (JSON.parse(firstBody) as Tokens).accessToken)).toBe(true)
  })

  it('dos refresh simultaneos con el mismo token (dos pestanas) reciben el mismo resultado', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => refresh(h, s.refreshToken, device)))
    expect([a!.status, b!.status, c!.status]).toEqual([200, 200, 200])
    const bodies = await Promise.all([a!.text(), b!.text(), c!.text()])
    expect(new Set(bodies).size).toBe(1)
    expect(audit(h, 'refresh.reuse')).toBe(0)
    const next = (JSON.parse(bodies[0]!) as Tokens).refreshToken
    expect((await refresh(h, next, device)).status).toBe(200)
  })

  it('pasada la ventana (10 s) sigue siendo reuso: 401, revoca las sesiones del dispositivo y queda en audit', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    const r = (await (await refresh(h, s.refreshToken, device)).json()) as Tokens
    h.clock.t += 10_000 // el limite aun cuenta como gracia
    expect((await refresh(h, s.refreshToken, device)).status).toBe(200)
    h.clock.t += 1
    expect((await refresh(h, s.refreshToken, device)).status).toBe(401)
    expect(audit(h, 'refresh.reuse')).toBe(1)
    expect(await alive(h, r.accessToken)).toBe(false)
    expect((await refresh(h, r.refreshToken, device)).status).toBe(401)
  })

  it('tras un logout, reusar el refresh viejo no cascadea a otras sesiones', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    const r = (await (await refresh(h, s.refreshToken, device)).json()) as Tokens
    await logout(h, r.refreshToken, device)
    const fresh = await loginOk(h, h.superId, SUPER_PIN, device) // sesion nueva del mismo usuario
    expect((await refresh(h, s.refreshToken, device)).status).toBe(401) // dentro de la gracia, pero la sesion ya esta cerrada
    expect(audit(h, 'refresh.reuse')).toBe(0)
    expect(await alive(h, fresh.accessToken)).toBe(true)
  })

  it('los tokens no se guardan en claro: la base solo tiene hashes', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    const r = (await (await refresh(h, s.refreshToken, device)).json()) as Tokens
    const dump = JSON.stringify(h.db.prepare('SELECT * FROM sessions').all())
    expect(dump).not.toContain(s.refreshToken)
    expect(dump).not.toContain(r.refreshToken)
  })
})

describe('vigencia: ventana deslizante de 12 h y tope absoluto de 7 dias', () => {
  it('cada refresh extiende 12 h', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    let tokens: Tokens = await loginOk(h, h.superId, SUPER_PIN, device)
    for (let i = 0; i < 5; i++) {
      h.clock.t += 11 * HOUR
      const res = await refresh(h, tokens.refreshToken, device)
      expect(res.status, `rotacion ${i}`).toBe(200)
      tokens = (await res.json()) as Tokens
    }
    h.clock.t += 12 * HOUR + 1
    expect((await refresh(h, tokens.refreshToken, device)).status).toBe(401)
  })

  it('aunque se use siempre a tiempo, la sesion muere a los 7 dias del login', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const loginAt = h.clock.t
    let tokens: Tokens = await loginOk(h, h.superId, SUPER_PIN, device)
    let rotations = 0
    for (;;) {
      h.clock.t += 11 * HOUR
      if (h.clock.t - loginAt >= 7 * DAY) break
      const res = await refresh(h, tokens.refreshToken, device)
      expect(res.status).toBe(200)
      tokens = (await res.json()) as Tokens
      rotations += 1
    }
    expect(rotations).toBe(15) // 15 x 11 h = 165 h < 168 h
    expect((await refresh(h, tokens.refreshToken, device)).status).toBe(401)
    expect(h.db.prepare('SELECT absolute_expires_at - created_at AS d FROM sessions').get()).toEqual({ d: 7 * DAY })
  })

  it('el access token tambien cae al llegar al tope absoluto, aunque no haya vencido', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const loginAt = h.clock.t
    let tokens: Tokens = await loginOk(h, h.superId, SUPER_PIN, device)
    while (h.clock.t + 11 * HOUR < loginAt + 7 * DAY - 60_000) {
      h.clock.t += 11 * HOUR
      tokens = (await (await refresh(h, tokens.refreshToken, device)).json()) as Tokens
    }
    h.clock.t = loginAt + 7 * DAY - 60_000
    tokens = (await (await refresh(h, tokens.refreshToken, device)).json()) as Tokens // access valido 15 min
    expect(await alive(h, tokens.accessToken)).toBe(true)
    h.clock.t = loginAt + 7 * DAY + 1
    expect(await alive(h, tokens.accessToken)).toBe(false)
  })
})

describe('migracion 004', () => {
  it('rellena el tope absoluto de las sesiones existentes', async () => {
    const old = (await import('better-sqlite3')).default(':memory:')
    old.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)')
    for (const m of migrations.slice(0, 3)) {
      old.exec(m.sql)
      old.prepare('INSERT INTO schema_migrations VALUES (?, ?, 0)').run(m.version, m.name)
    }
    const t = 1_800_000_000_000
    old
      .prepare("INSERT INTO users (id, branch_id, restaurant_id, name, role, pin_hash, pin_salt, created_at, updated_at) VALUES ('u', 'b', 'r', 'D', 'super', 'h', 's', ?, ?)")
      .run(t, t)
    old.prepare("INSERT INTO devices (id, branch_id, name, token_hash, created_at, updated_at) VALUES ('d', 'b', 'C', 'x', ?, ?)").run(t, t)
    old
      .prepare("INSERT INTO sessions (id, user_id, device_id, refresh_hash, expires_at, created_at, updated_at) VALUES ('s', 'u', 'd', 'rh', ?, ?, ?)")
      .run(t + 12 * HOUR, t, t)
    migrate(old)
    expect(old.prepare('SELECT absolute_expires_at AS a, prev_refresh_hash AS p FROM sessions').get()).toEqual({ a: t + 7 * DAY, p: null })
    old.close()
  })
})

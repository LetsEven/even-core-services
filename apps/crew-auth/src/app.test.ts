import { createLocalJWKSet, jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS, permissionsFor } from './auth/roles.js'
import { migrate } from './db/index.js'
import { BRANCH, SUPER_PIN, loginOk, makeHarness } from './test/helpers.js'

describe('health y cabeceras', () => {
  it('responde ok con cabeceras de seguridad y CORS por lista', async () => {
    const h = await makeHarness()
    const res = await h.req('GET', '/health', { headers: { origin: 'https://crew.example' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('access-control-allow-origin')).toBe('https://crew.example')
    const other = await h.req('GET', '/health', { headers: { origin: 'https://evil.example' } })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('las migraciones son idempotentes', async () => {
    const h = await makeHarness()
    expect(() => migrate(h.db)).not.toThrow()
  })
})

describe('pairing', () => {
  it('el codigo es de un solo uso', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const login = await loginOk(h, h.superId, SUPER_PIN, device)
    const created = await h.req('POST', '/v1/devices/pairing-codes', { bearer: login.accessToken, body: {} })
    expect(created.status).toBe(201)
    const { pairingCode, branchId } = (await created.json()) as { pairingCode: string; branchId: string }
    expect(branchId).toBe(BRANCH)

    const first = await h.req('POST', '/v1/devices/pair', { body: { pairingCode } })
    expect(first.status).toBe(201)
    expect(((await first.json()) as { branchId: string }).branchId).toBe(BRANCH)
    const second = await h.req('POST', '/v1/devices/pair', { body: { pairingCode } })
    expect(second.status).toBe(401)
  })

  it('el codigo expira a los 10 minutos', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const login = await loginOk(h, h.superId, SUPER_PIN, device)
    const created = await h.req('POST', '/v1/devices/pairing-codes', { bearer: login.accessToken, body: {} })
    const { pairingCode } = (await created.json()) as { pairingCode: string }
    h.clock.t += 10 * 60 * 1000 + 1
    const res = await h.req('POST', '/v1/devices/pair', { body: { pairingCode } })
    expect(res.status).toBe(401)
  })

  it('un codigo inventado se rechaza y crear codigos exige super', async () => {
    const h = await makeHarness()
    expect((await h.req('POST', '/v1/devices/pair', { body: { pairingCode: 'ZZZZ-ZZZZ' } })).status).toBe(401)
    expect((await h.req('POST', '/v1/devices/pairing-codes', { body: {} })).status).toBe(401)
    const device = await h.pair()
    const mesero = await h.addUser('Ana', 'mesero')
    const m = await loginOk(h, mesero, '1234', device)
    expect((await h.req('POST', '/v1/devices/pairing-codes', { bearer: m.accessToken, body: {} })).status).toBe(403)
  })
})

describe('login', () => {
  it('correcto devuelve tokens y usuario con permisos; incorrecto da mensaje generico', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const ok = await loginOk(h, h.superId, SUPER_PIN, device)
    expect(ok.user.role).toBe('super')
    expect(ok.user.permissions).toContain('usuarios.administrar')
    expect(ok.expiresIn).toBe(900)

    const bad = await h.login(h.superId, '000000', device)
    const unknown = await h.login('no-existe', '123456', device)
    expect(bad.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await bad.json()).toEqual(await unknown.json())
  })

  it('exige dispositivo vinculado y PIN valido', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    expect((await h.login(h.superId, SUPER_PIN, 'token-falso')).status).toBe(401)
    expect((await h.req('POST', '/v1/login', { body: { userId: h.superId, pin: SUPER_PIN } })).status).toBe(401)
    expect((await h.login(h.superId, 'abc', device)).status).toBe(400)
  })

  it('bloquea tras 5 fallos por 15 minutos, incluso con el PIN correcto', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    for (let i = 0; i < 5; i++) expect((await h.login(id, '9999', device)).status).toBe(401)
    expect((await h.login(id, '1234', device)).status).toBe(401)
    h.clock.t += 15 * 60 * 1000 + 1
    expect((await h.login(id, '1234', device)).status).toBe(200)
  })

  it('un login correcto reinicia el contador de fallos', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    for (let i = 0; i < 4; i++) await h.login(id, '9999', device)
    expect((await h.login(id, '1234', device)).status).toBe(200)
    for (let i = 0; i < 4; i++) await h.login(id, '9999', device)
    expect((await h.login(id, '1234', device)).status).toBe(200)
  })

  it('aplica rate limit por dispositivo', async () => {
    const h = await makeHarness({
      rateLimit: { windowMs: 60_000, loginPerIp: 1000, loginPerDevice: 3, pairPerIp: 1000 },
    })
    const device = await h.pair()
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push((await h.login(h.superId, '000000', device)).status)
    expect(codes).toEqual([401, 401, 401, 429, 429])
    const limited = await h.login(h.superId, SUPER_PIN, device)
    expect(limited.headers.get('retry-after')).not.toBeNull()
    h.clock.t += 61_000
    expect((await h.login(h.superId, SUPER_PIN, device)).status).toBe(200)
  })
})

describe('refresh y logout', () => {
  it('rota el refresh: el viejo deja de servir y su reuso cierra la sesion nueva', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const first = await loginOk(h, h.superId, SUPER_PIN, device)
    const r1 = await h.req('POST', '/v1/refresh', { body: { refreshToken: first.refreshToken } })
    expect(r1.status).toBe(200)
    const second = (await r1.json()) as { accessToken: string; refreshToken: string }
    expect(second.refreshToken).not.toBe(first.refreshToken)

    const reuse = await h.req('POST', '/v1/refresh', { body: { refreshToken: first.refreshToken } })
    expect(reuse.status).toBe(401)
    const afterReuse = await h.req('POST', '/v1/refresh', { body: { refreshToken: second.refreshToken } })
    expect(afterReuse.status).toBe(401)
  })

  it('el refresh vence a las 12 horas', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    h.clock.t += 12 * 60 * 60 * 1000 + 1
    expect((await h.req('POST', '/v1/refresh', { body: { refreshToken: s.refreshToken } })).status).toBe(401)
  })

  it('logout revoca refresh y corta el access token', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    expect((await h.req('GET', '/v1/audit', { bearer: s.accessToken })).status).toBe(200)
    const out = await h.req('POST', '/v1/logout', { body: { refreshToken: s.refreshToken } })
    expect(out.status).toBe(200)
    expect((await h.req('POST', '/v1/refresh', { body: { refreshToken: s.refreshToken } })).status).toBe(401)
    expect((await h.req('GET', '/v1/audit', { bearer: s.accessToken })).status).toBe(401)
  })

  it('desactivar al usuario revoca sus sesiones', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    const id = await h.addUser('Ana', 'mesero')
    const ana = await loginOk(h, id, '1234', device)
    const res = await h.req('PATCH', `/v1/users/${id}`, { bearer: sup.accessToken, body: { active: false } })
    expect(res.status).toBe(200)
    expect((await h.req('POST', '/v1/refresh', { body: { refreshToken: ana.refreshToken } })).status).toBe(401)
    expect((await h.login(id, '1234', device)).status).toBe(401)
  })
})

describe('usuarios', () => {
  it('GET /v1/users nunca devuelve hashes ni sales', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    await h.addUser('Ana', 'mesero')
    await h.addUser('Beto', 'cocina')
    const res = await h.req('GET', `/v1/users?branchId=${BRANCH}`, { device })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toMatch(/pin|hash|salt/i)
    const { users } = JSON.parse(text) as { users: Record<string, unknown>[] }
    expect(users).toHaveLength(3)
    for (const u of users) expect(Object.keys(u).sort()).toEqual(['id', 'name', 'role'])
    // Tampoco en el listado administrativo.
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    const admin = await h.req('GET', '/v1/admin/users', { bearer: sup.accessToken })
    expect(await admin.text()).not.toMatch(/pin_|hash|salt/i)
  })

  it('exige dispositivo y limita a su sucursal; omite inactivos y otras sucursales', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    expect((await h.req('GET', '/v1/users')).status).toBe(401)
    expect((await h.req('GET', '/v1/users?branchId=otra', { device })).status).toBe(403)
    const id = await h.addUser('Inactiva', 'mesero')
    h.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id)
    await h.addUser('Otra', 'mesero', '1234', { branchId: 'otra-sucursal' })
    const { users } = (await (await h.req('GET', '/v1/users', { device })).json()) as { users: { name: string }[] }
    expect(users.map((u) => u.name)).toEqual(['Dueno'])
  })

  it('el super administra: crear, editar, resetear PIN y eliminar', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    const created = await h.req('POST', '/v1/users', {
      bearer: sup.accessToken,
      body: { name: 'Carla', role: 'cocina', pin: '4321', cocinaOperar: true },
    })
    expect(created.status).toBe(201)
    const { user } = (await created.json()) as { user: { id: string } }
    expect((await loginOk(h, user.id, '4321', device)).user.permissions).toContain('cocina.operar')

    expect((await h.req('PATCH', `/v1/users/${user.id}`, { bearer: sup.accessToken, body: { role: 'cajero' } })).status).toBe(200)
    expect((await h.req('POST', `/v1/users/${user.id}/reset-pin`, { bearer: sup.accessToken, body: { pin: '8765' } })).status).toBe(200)
    expect((await h.login(user.id, '4321', device)).status).toBe(401)
    const relog = await loginOk(h, user.id, '8765', device)
    expect(relog.user.role).toBe('cajero')
    expect(relog.user.permissions).not.toContain('cocina.operar')

    expect((await h.req('DELETE', `/v1/users/${user.id}`, { bearer: sup.accessToken })).status).toBe(200)
    expect((await h.login(user.id, '8765', device)).status).toBe(401)
  })

  it('valida entrada con zod y protege al ultimo super', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    const bad = await h.req('POST', '/v1/users', { bearer: sup.accessToken, body: { name: 'X', role: 'admin', pin: '12' } })
    expect(bad.status).toBe(400)
    expect((await h.req('PATCH', `/v1/users/${h.superId}`, { bearer: sup.accessToken, body: { role: 'mesero' } })).status).toBe(409)
    expect((await h.req('DELETE', `/v1/users/${h.superId}`, { bearer: sup.accessToken })).status).toBe(409)
  })

  it('no permite tocar usuarios de otro restaurante', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    const { insertUser } = await import('./db/users.js')
    const foreign = await insertUser(h.db, h.clock.t, {
      branchId: 'x', restaurantId: 'otro', name: 'Ajeno', role: 'mesero', pin: '1234',
    })
    expect((await h.req('PATCH', `/v1/users/${foreign.id}`, { bearer: sup.accessToken, body: { name: 'Z' } })).status).toBe(404)
  })
})

describe('permisos por rol en endpoints admin', () => {
  it('solo super: el resto recibe 403 y sin token 401', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const admin: [string, string, unknown?][] = [
      ['POST', '/v1/users', { name: 'N', role: 'mesero', pin: '1234' }],
      ['PATCH', `/v1/users/${h.superId}`, { name: 'N' }],
      ['DELETE', `/v1/users/${h.superId}`],
      ['POST', `/v1/users/${h.superId}/reset-pin`, { pin: '1234' }],
      ['GET', '/v1/audit'],
      ['GET', '/v1/admin/users'],
      ['POST', '/v1/devices/pairing-codes', {}],
    ]
    for (const role of ['cajero', 'mesero', 'cocina'] as const) {
      const id = await h.addUser(role, role)
      const t = await loginOk(h, id, '1234', device)
      for (const [method, path, body] of admin) {
        const res = await h.req(method, path, { bearer: t.accessToken, body })
        expect(res.status, `${role} ${method} ${path}`).toBe(403)
      }
    }
    for (const [method, path, body] of admin) {
      expect((await h.req(method, path, { body })).status, `anon ${method} ${path}`).toBe(401)
    }
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    expect((await h.req('GET', '/v1/audit', { bearer: sup.accessToken })).status).toBe(200)
  })

  it('roles.ts coincide con el contrato', () => {
    expect(ROLE_PERMISSIONS.mesero).toEqual(['mesas.ver', 'comanda.crear', 'cuenta.ver', 'cuenta.cobrar'])
    expect(ROLE_PERMISSIONS.cajero).toEqual([...ROLE_PERMISSIONS.mesero, 'caja.ver', 'caja.resumen'])
    expect(ROLE_PERMISSIONS.cocina).toEqual(['cocina.ver'])
    expect(permissionsFor('cocina', { cocinaOperar: true })).toEqual(['cocina.ver', 'cocina.operar'])
    expect(permissionsFor('mesero', { cocinaOperar: true })).not.toContain('cocina.operar')
    expect(ROLE_PERMISSIONS.super).toHaveLength(11)
  })
})

describe('audit', () => {
  it('registra login, logout y cambios sin PINs ni tokens', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const s = await loginOk(h, h.superId, SUPER_PIN, device)
    await h.login(h.superId, '000000', device)
    await h.req('POST', '/v1/users', { bearer: s.accessToken, body: { name: 'N', role: 'mesero', pin: '5555' } })
    await h.req('POST', '/v1/logout', { body: { refreshToken: s.refreshToken } })
    const sup2 = await loginOk(h, h.superId, SUPER_PIN, device)
    const res = await h.req('GET', '/v1/audit?limit=100', { bearer: sup2.accessToken })
    const text = await res.text()
    const actions = (JSON.parse(text) as { events: { action: string }[] }).events.map((e) => e.action)
    for (const a of ['login.ok', 'login.fail', 'user.create', 'logout']) expect(actions).toContain(a)
    expect(text).not.toContain('5555')
    expect(text).not.toContain(s.refreshToken)
    expect(text).not.toContain(s.accessToken)
  })
})

describe('JWT y JWKS', () => {
  it('el access token se verifica con el JWKS publicado', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Cris', 'cajero')
    const s = await loginOk(h, id, '1234', device)

    const jwksRes = await h.req('GET', '/.well-known/jwks.json')
    expect(jwksRes.status).toBe(200)
    const jwks = (await jwksRes.json()) as { keys: Record<string, unknown>[] }
    expect(jwks.keys).toHaveLength(1)
    expect(jwks.keys[0]).not.toHaveProperty('d')

    const { payload, protectedHeader } = await jwtVerify(s.accessToken, createLocalJWKSet(jwks as never), {
      issuer: 'crew-auth',
      audience: 'even-crew',
      currentDate: new Date(h.clock.t),
    })
    expect(protectedHeader.alg).toBe('EdDSA')
    expect(payload.sub).toBe(id)
    expect(payload.role).toBe('cajero')
    expect(payload.permissions).toEqual(ROLE_PERMISSIONS.cajero)
    expect(payload.branchId).toBe(BRANCH)
    expect(payload.restaurantId).toBe('rest-1')
    expect(payload.deviceId).toBeTypeOf('string')
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(900)

    await expect(
      jwtVerify(s.accessToken, createLocalJWKSet(jwks as never), {
        issuer: 'crew-auth',
        audience: 'even-crew',
        currentDate: new Date(h.clock.t + 16 * 60 * 1000),
      }),
    ).rejects.toThrow()
  })
})

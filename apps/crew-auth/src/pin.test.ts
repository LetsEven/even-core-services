import { randomBytes, scrypt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PIN_SCHEME, hashPin, needsRehash, verifyPin } from './auth/pin.js'
import { DEV_PIN_PEPPER, loadConfig } from './config.js'
import { SUPER_PIN, loginOk, makeHarness } from './test/helpers.js'

const PEPPER = 'a'.repeat(32)
const OTHER = 'b'.repeat(32)

// Hash tal como se guardaba antes del pepper (v1): scrypt(pin, sal) sin prefijo.
function legacyHash(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16)
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) =>
      e ? reject(e) : resolve({ hash: k.toString('hex'), salt: salt.toString('hex') }),
    ),
  )
}

describe('PIN con pepper', () => {
  it('el hash lleva la version del esquema y se verifica solo con el mismo pepper', async () => {
    const { hash, salt } = await hashPin('1234', PEPPER)
    expect(hash.startsWith(`${PIN_SCHEME}$`)).toBe(true)
    expect(PIN_SCHEME).toBe('v2')
    expect(needsRehash(hash)).toBe(false)
    expect(await verifyPin('1234', hash, salt, PEPPER)).toBe(true)
    expect(await verifyPin('1235', hash, salt, PEPPER)).toBe(false)
    expect(await verifyPin('1234', hash, salt, OTHER)).toBe(false)
  })

  it('con la misma sal y distinto pepper el hash es distinto; sin el pepper no se puede probar PIN offline', async () => {
    const a = await hashPin('1234', PEPPER)
    const b = await hashPin('1234', OTHER)
    expect(a.hash).not.toBe(b.hash)
    // Un atacante con la base pero sin pepper prueba scrypt(pin, sal) (esquema v1): no coincide.
    const { hash: v1 } = await legacyHash('1234')
    expect(v1).not.toBe(a.hash.slice(PIN_SCHEME.length + 1))
    const asV1 = await new Promise<string>((res, rej) =>
      scrypt('1234', Buffer.from(a.salt, 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) =>
        e ? rej(e) : res(k.toString('hex')),
      ),
    )
    expect(asV1).not.toBe(a.hash.slice(PIN_SCHEME.length + 1))
  })

  it('un hash v1 (sin prefijo) se sigue aceptando y se marca para migrar', async () => {
    const { hash, salt } = await legacyHash('4321')
    expect(needsRehash(hash)).toBe(true)
    expect(await verifyPin('4321', hash, salt, PEPPER)).toBe(true)
    expect(await verifyPin('0000', hash, salt, PEPPER)).toBe(false)
  })
})

describe('migracion v1 -> v2 en el login', () => {
  it('un usuario con hash legado entra y su hash pasa a v2; el siguiente login sigue funcionando', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const id = await h.addUser('Ana', 'mesero', '1234')
    const legacy = await legacyHash('1234')
    h.db.prepare('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?').run(legacy.hash, legacy.salt, id)

    // PIN malo: no migra.
    expect((await h.login(id, '9999', device)).status).toBe(401)
    expect((h.db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(id) as { pin_hash: string }).pin_hash).toBe(legacy.hash)

    expect((await h.login(id, '1234', device)).status).toBe(200)
    const row = h.db.prepare('SELECT pin_hash, pin_salt FROM users WHERE id = ?').get(id) as { pin_hash: string; pin_salt: string }
    expect(row.pin_hash.startsWith('v2$')).toBe(true)
    expect(row.pin_salt).not.toBe(legacy.salt)
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.pin_rehash'").get()).toEqual({ n: 1 })
    expect((await h.login(id, '1234', device)).status).toBe(200)
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.pin_rehash'").get()).toEqual({ n: 1 })
  })

  it('altas y resets guardan v2', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    const sup = await loginOk(h, h.superId, SUPER_PIN, device)
    expect((h.db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(h.superId) as { pin_hash: string }).pin_hash).toMatch(/^v2\$/)
    const created = await h.req('POST', '/v1/users', { bearer: sup.accessToken, body: { name: 'N', role: 'mesero', pin: '1234' } })
    const { user } = (await created.json()) as { user: { id: string } }
    await h.req('POST', `/v1/users/${user.id}/reset-pin`, { bearer: sup.accessToken, body: { pin: '5678' } })
    expect((h.db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(user.id) as { pin_hash: string }).pin_hash).toMatch(/^v2\$/)
    expect((await h.login(user.id, '5678', device)).status).toBe(200)
  })

  it('la base no guarda el PIN ni lo expone en el audit', async () => {
    const h = await makeHarness()
    const device = await h.pair()
    await loginOk(h, h.superId, SUPER_PIN, device)
    expect(JSON.stringify(h.db.prepare('SELECT * FROM users').all())).not.toContain(SUPER_PIN)
    expect(JSON.stringify(h.db.prepare('SELECT * FROM audit_log').all())).not.toContain(SUPER_PIN)
  })
})

describe('CREW_AUTH_PIN_PEPPER', () => {
  it('es obligatorio en produccion y exige 32+ caracteres', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/CREW_AUTH_PIN_PEPPER.*obligatorio/)
    expect(() => loadConfig({ NODE_ENV: 'production', CREW_AUTH_PIN_PEPPER: 'corto' })).toThrow(/corto/)
    const c = loadConfig({ NODE_ENV: 'production', CREW_AUTH_PIN_PEPPER: PEPPER })
    expect(c.pinPepper).toBe(PEPPER)
    expect(c.pinPepperFromEnv).toBe(true)
  })

  it('fuera de produccion usa el de desarrollo si falta, pero uno definido manda y se valida', () => {
    const dev = loadConfig({})
    expect(dev.pinPepper).toBe(DEV_PIN_PEPPER)
    expect(dev.pinPepperFromEnv).toBe(false)
    expect(loadConfig({ CREW_AUTH_PIN_PEPPER: OTHER }).pinPepper).toBe(OTHER)
    expect(() => loadConfig({ CREW_AUTH_PIN_PEPPER: 'x' })).toThrow(/corto/)
  })

  it('el pepper de produccion no es el de desarrollo', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', CREW_AUTH_PIN_PEPPER: DEV_PIN_PEPPER })).toThrow(/desarrollo/)
  })
})

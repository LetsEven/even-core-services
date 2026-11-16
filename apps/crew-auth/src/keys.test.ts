import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSuperUser } from './cli/createSuper.js'
import { createSigner, generatePem, resolvePrivateKeyPem } from './auth/tokens.js'
import { DEV_PIN_PEPPER, loadConfig } from './config.js'
import { openDb } from './db/index.js'

describe('clave privada', () => {
  it('se genera y persiste con permisos 600 y se reutiliza', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-auth-'))
    try {
      const dataDir = join(dir, 'data')
      const first = await resolvePrivateKeyPem({ privateKeyPem: undefined, dataDir, production: false })
      const file = join(dataDir, 'crew-auth-private-key.pem')
      expect(statSync(file).mode & 0o777).toBe(0o600)
      const second = await resolvePrivateKeyPem({ privateKeyPem: undefined, dataDir, production: false })
      expect(second).toBe(first)
      expect((await createSigner(first, 'crew-auth')).kid).toBe((await createSigner(second, 'crew-auth')).kid)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('la env CREW_AUTH_PRIVATE_KEY tiene prioridad y acepta \\n literales', async () => {
    const pem = await generatePem()
    const config = loadConfig({ CREW_AUTH_PRIVATE_KEY: pem.trim().replace(/\n/g, '\\n') })
    expect(await resolvePrivateKeyPem(config)).toBe(pem.trim())
  })

  it('rechaza claves que no son Ed25519', async () => {
    const { generateKeyPairSync } = await import('node:crypto')
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })
    await expect(createSigner(String(rsa), 'crew-auth')).rejects.toThrow(/Ed25519/)
  })
})

describe('create-super', () => {
  it('crea un super con PIN valido y rechaza uno invalido', async () => {
    const db = openDb(':memory:')
    const r = await createSuperUser(db, { branchId: 'b1', restaurantId: 'r1', name: 'Dueno', pin: '123456', pinPepper: DEV_PIN_PEPPER })
    const row = db.prepare('SELECT role, restaurant_id FROM users WHERE id = ?').get(r.id)
    expect(row).toEqual({ role: 'super', restaurant_id: 'r1' })
    await expect(createSuperUser(db, { branchId: 'b1', restaurantId: 'r1', name: 'X', pin: '12', pinPepper: DEV_PIN_PEPPER })).rejects.toThrow()
    await expect(createSuperUser(db, { branchId: 'b1', restaurantId: 'r1', name: 'X', pin: '12345', pinPepper: DEV_PIN_PEPPER })).rejects.toThrow(/6 a 8/)
  })
})

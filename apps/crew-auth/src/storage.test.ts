import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSigner, generatePem, resolvePrivateKeyPem } from './auth/tokens.js'
import { loadConfig } from './config.js'
import { hardenDataDir, openSecureDb, warnIfRoot } from './storage.js'

const mode = (p: string) => statSync(p).mode & 0o777

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'crew-auth-fs-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('permisos de DATA_DIR y de la base', () => {
  it('crea DATA_DIR con 0700 (tambien anidado) y corrige uno existente con permisos abiertos', () => {
    const nested = join(tmp, 'a', 'b')
    hardenDataDir(nested)
    expect(mode(nested)).toBe(0o700)

    const open = join(tmp, 'abierto')
    mkdirSync(open, { mode: 0o755 })
    chmodSync(open, 0o755)
    hardenDataDir(open)
    expect(mode(open)).toBe(0o700)
  })

  it('la base y sus WAL/SHM quedan en 0600, incluso si ya existia con 0644', () => {
    const dataDir = join(tmp, 'data')
    const dbPath = join(dataDir, 'crew-auth.db')
    const config = { dataDir, dbPath }
    const db = openSecureDb(config)
    db.prepare("INSERT INTO audit_log (id, at, action, created_at, updated_at) VALUES ('x', 1, 'a', 1, 1)").run()
    expect(mode(dataDir)).toBe(0o700)
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      expect(existsSync(f), f).toBe(true)
      expect(mode(f), f).toBe(0o600)
    }
    db.close()

    chmodSync(dbPath, 0o644)
    chmodSync(dataDir, 0o755)
    openSecureDb(config).close()
    expect(mode(dbPath)).toBe(0o600)
    expect(mode(dataDir)).toBe(0o700)
  })

  it('un archivo nuevo del proceso nace sin permisos para grupo ni otros (umask 077)', () => {
    openSecureDb({ dataDir: join(tmp, 'd'), dbPath: join(tmp, 'd', 'x.db') }).close()
    const f = join(tmp, 'nuevo.txt')
    writeFileSync(f, 'x')
    expect(mode(f) & 0o077).toBe(0)
  })

  it('si no se puede preparar DATA_DIR el error es claro y nombra la variable', () => {
    const file = join(tmp, 'es-un-archivo')
    writeFileSync(file, 'x')
    expect(() => hardenDataDir(join(file, 'data'))).toThrow(/DATA_DIR.*ENOTDIR.*README/s)
  })

  it('avisa cuando corre como root', () => {
    const spy = vi.spyOn(process, 'getuid').mockReturnValue(0)
    const log = vi.fn()
    warnIfRoot(log)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('root'))
    spy.mockReturnValue(1000)
    log.mockClear()
    warnIfRoot(log)
    expect(log).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('clave privada en produccion', () => {
  it('NODE_ENV=production sin CREW_AUTH_PRIVATE_KEY no arranca y no genera ningun archivo', async () => {
    const config = loadConfig({ NODE_ENV: 'production', DATA_DIR: join(tmp, 'data') })
    expect(config.production).toBe(true)
    await expect(resolvePrivateKeyPem(config)).rejects.toThrow(/CREW_AUTH_PRIVATE_KEY.*obligatoria/)
    expect(existsSync(join(tmp, 'data'))).toBe(false)
  })

  it('en produccion ignora una clave que haya en el volumen y usa la de la variable', async () => {
    const dataDir = join(tmp, 'data')
    mkdirSync(dataDir)
    writeFileSync(join(dataDir, 'crew-auth-private-key.pem'), await generatePem())
    const pem = await generatePem()
    const config = loadConfig({ NODE_ENV: 'production', DATA_DIR: dataDir, CREW_AUTH_PRIVATE_KEY: pem })
    expect(await resolvePrivateKeyPem(config)).toBe(pem.trim())
  })

  it('fuera de produccion se sigue autogenerando', async () => {
    const config = loadConfig({ NODE_ENV: 'development', DATA_DIR: join(tmp, 'data') })
    expect(config.production).toBe(false)
    const pem = await resolvePrivateKeyPem(config)
    expect((await createSigner(pem, 'crew-auth')).kid).toBeTruthy()
    expect(mode(join(tmp, 'data', 'crew-auth-private-key.pem'))).toBe(0o600)
  })
})

describe('create-super', () => {
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/createSuper.ts', ...args], {
      cwd: join(import.meta.dirname, '..'),
      env: { PATH: process.env.PATH ?? '', DATA_DIR: join(tmp, 'data'), ...env },
      encoding: 'utf8',
      input: '',
    })

  it('exige --restaurant: sin el no hay default a la sucursal', () => {
    const r = run(['--branch', 'suc-1', '--name', 'Dueno'], { CREW_AUTH_SUPER_PIN: '123456' })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('--restaurant')
    expect(existsSync(join(tmp, 'data'))).toBe(false)
  })

  it('con --restaurant crea el super, deja la base en 0600 y no imprime el PIN', () => {
    const r = run(['--restaurant', 'rest-9', '--branch', 'suc-1', '--name', 'Dueno', '--pairing-code'], {
      CREW_AUTH_SUPER_PIN: '246810',
    })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toMatch(/Super creado: /)
    expect(r.stdout + r.stderr).not.toContain('246810')
    expect(mode(join(tmp, 'data'))).toBe(0o700)
    expect(mode(join(tmp, 'data', 'crew-auth.db'))).toBe(0o600)
  })
})

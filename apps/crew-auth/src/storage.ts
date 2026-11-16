import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Config } from './config.js'
import { openDb } from './db/index.js'
import type { Db } from './db/index.js'

const HINT =
  'El proceso debe ser el dueno del directorio y no hace falta (ni conviene) correrlo como root. ' +
  'Con un volumen montado como root (Railway) ver "Archivos, permisos y root" en el README.'

function describe(e: unknown): string {
  const code = (e as NodeJS.ErrnoException | undefined)?.code
  return code ?? (e instanceof Error ? e.message : 'error desconocido')
}

function mustBeOwnerOnly(path: string, mask: number, what: string): void {
  if (process.platform === 'win32') return // los modos POSIX no aplican
  const mode = statSync(path).mode & 0o777
  if (mode & mask) {
    throw new Error(`${what} (${path}) quedo con permisos ${mode.toString(8)} y no se pudo restringir. ${HINT}`)
  }
}

/** Crea DATA_DIR (0700) y fuerza el modo aunque ya existiera con otro. Falla con un mensaje claro. */
export function hardenDataDir(dataDir: string): void {
  try {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 })
    chmodSync(dataDir, 0o700)
  } catch (e) {
    throw new Error(`No se pudo preparar DATA_DIR (${dataDir}): ${describe(e)}. ${HINT}`)
  }
  mustBeOwnerOnly(dataDir, 0o077, 'DATA_DIR')
}

/** La base y sus archivos WAL/SHM (contienen hashes de PIN y tokens): solo el dueno (0600). */
export function hardenDbFiles(dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = dbPath + suffix
    if (!existsSync(file)) continue
    try {
      chmodSync(file, 0o600)
    } catch (e) {
      throw new Error(`No se pudo restringir ${file} a 0600: ${describe(e)}. ${HINT}`)
    }
    mustBeOwnerOnly(file, 0o077, 'La base de datos')
  }
}

/** Con root el servicio funciona, pero un fallo del servicio tendria alcance de root sobre el volumen. */
export function warnIfRoot(log: (msg: string) => void = console.warn): void {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    log('crew-auth corre como root: usa un usuario sin privilegios (ver "Archivos, permisos y root" en el README)')
  }
}

/** umask 077 + DATA_DIR 0700 + base 0600. Todo archivo nuevo del proceso nace solo para su dueno. */
export function openSecureDb(config: Pick<Config, 'dbPath' | 'dataDir'>): Db {
  process.umask(0o077)
  if (config.dbPath !== ':memory:') hardenDataDir(dirname(config.dbPath))
  const db = openDb(config.dbPath)
  if (config.dbPath !== ':memory:') hardenDbFiles(config.dbPath)
  return db
}

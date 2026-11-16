import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { Role } from './roles.js'

/** PIN de uso general (login y roles no-super): 4 a 8 digitos. */
export const pinSchema = z.string().regex(/^\d{4,8}$/, 'El PIN debe tener de 4 a 8 digitos')
/** El super administra todo el restaurante: minimo 6 digitos. */
export const superPinSchema = z.string().regex(/^\d{6,8}$/, 'El PIN de un super debe tener de 6 a 8 digitos')

export const pinSchemaFor = (role: Role) => (role === 'super' ? superPinSchema : pinSchema)

const KEY_LEN = 64
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

// Esquema del hash (para poder migrar sin invalidar PIN):
//   v2$<hex>  scrypt(HMAC-SHA256(CREW_AUTH_PIN_PEPPER, pin), sal)  <- actual
//   <hex>     (sin prefijo) v1: scrypt(pin, sal) a secas, anterior al pepper; se acepta y se
//             vuelve a guardar como v2 en el siguiente login correcto.
// El pepper es un secreto del proveedor (no esta en la base): con la base filtrada solo, no se puede
// probar PIN offline. Cambiar el pepper invalida todos los v2 (cada uno tendria que resetearse); para
// rotarlo habria que introducir un v3 que acepte el anterior durante la migracion.
export const PIN_SCHEME = 'v2'
const PREFIX = `${PIN_SCHEME}$`

const peppered = (pin: string, pepper: string): Buffer => createHmac('sha256', pepper).update(pin).digest()

function derive(secret: string | Buffer, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_LEN, SCRYPT_OPTS, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export async function hashPin(pin: string, pepper: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16)
  const key = await derive(peppered(pin, pepper), salt)
  return { hash: PREFIX + key.toString('hex'), salt: salt.toString('hex') }
}

/** Comparacion en tiempo constante. Acepta v2 (con pepper) y v1 (legado). */
export async function verifyPin(pin: string, hash: string, salt: string, pepper: string): Promise<boolean> {
  const v2 = hash.startsWith(PREFIX)
  const expected = Buffer.from(v2 ? hash.slice(PREFIX.length) : hash, 'hex')
  const actual = await derive(v2 ? peppered(pin, pepper) : pin, Buffer.from(salt, 'hex'))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** True si el hash es de un esquema anterior al actual (hay que volver a guardarlo tras un login correcto). */
export const needsRehash = (hash: string): boolean => !hash.startsWith(PREFIX)

let dummy: Promise<{ hash: string; salt: string }> | undefined

/** Gasta el mismo costo que una verificacion real (usuario inexistente o bloqueado). */
export async function burnPinVerification(pin: string, pepper: string): Promise<void> {
  dummy ??= hashPin('00000000', pepper)
  const d = await dummy
  await verifyPin(pin, d.hash, d.salt, pepper)
}

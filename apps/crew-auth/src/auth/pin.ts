import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const pinSchema = z.string().regex(/^\d{4,8}$/, 'El PIN debe tener de 4 a 8 digitos')

const KEY_LEN = 64
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function derive(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, KEY_LEN, SCRYPT_OPTS, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16)
  const key = await derive(pin, salt)
  return { hash: key.toString('hex'), salt: salt.toString('hex') }
}

/** Comparacion en tiempo constante. */
export async function verifyPin(pin: string, hash: string, salt: string): Promise<boolean> {
  const expected = Buffer.from(hash, 'hex')
  const actual = await derive(pin, Buffer.from(salt, 'hex'))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

let dummy: Promise<{ hash: string; salt: string }> | undefined

/** Gasta el mismo costo que una verificacion real (usuario inexistente o bloqueado). */
export async function burnPinVerification(pin: string): Promise<void> {
  dummy ??= hashPin('00000000')
  const d = await dummy
  await verifyPin(pin, d.hash, d.salt)
}

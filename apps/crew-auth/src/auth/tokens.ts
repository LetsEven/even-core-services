import { createHash, createPrivateKey, createPublicKey, randomBytes } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
} from 'jose'
import type { JWK } from 'jose'
import { AUDIENCE } from '../config.js'
import type { Config } from '../config.js'
import type { Permission, Role } from './roles.js'

export interface AccessClaims {
  sub: string
  role: Role
  permissions: Permission[]
  branchId: string
  restaurantId: string
  deviceId: string
  sid: string
}

export interface Signer {
  kid: string
  jwks(): { keys: JWK[] }
  signAccess(claims: AccessClaims, now: number, ttlSec: number): Promise<string>
  verifyAccess(token: string, now: number): Promise<AccessClaims>
}

export async function generatePem(): Promise<string> {
  const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  return exportPKCS8(privateKey)
}

/** PEM por env; si falta, lo lee de DATA_DIR o genera uno y lo persiste con permisos 600. */
export async function resolvePrivateKeyPem(config: Pick<Config, 'privateKeyPem' | 'dataDir'>): Promise<string> {
  if (config.privateKeyPem) return config.privateKeyPem
  const file = join(config.dataDir, 'crew-auth-private-key.pem')
  if (existsSync(file)) {
    chmodSync(file, 0o600)
    return readFileSync(file, 'utf8')
  }
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
  const pem = await generatePem()
  writeFileSync(file, pem, { mode: 0o600, flag: 'wx' })
  chmodSync(file, 0o600)
  return pem
}

export async function createSigner(pem: string, issuer: string): Promise<Signer> {
  const privateKey: KeyObject = createPrivateKey(pem)
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('CREW_AUTH_PRIVATE_KEY debe ser una clave Ed25519 en PEM (PKCS8)')
  }
  const publicKey = createPublicKey(privateKey)
  const publicJwk = await exportJWK(publicKey)
  const kid = await calculateJwkThumbprint(publicJwk)
  const jwk: JWK = { ...publicJwk, kid, alg: 'EdDSA', use: 'sig' }

  return {
    kid,
    jwks: () => ({ keys: [jwk] }),
    async signAccess(claims, now, ttlSec) {
      const nowSec = Math.floor(now / 1000)
      const { sub, ...rest } = claims
      return new SignJWT({ ...rest })
        .setProtectedHeader({ alg: 'EdDSA', kid, typ: 'JWT' })
        .setIssuer(issuer)
        .setAudience(AUDIENCE)
        .setSubject(sub)
        .setIssuedAt(nowSec)
        .setExpirationTime(nowSec + ttlSec)
        .sign(privateKey)
    },
    async verifyAccess(token, now) {
      const { payload } = await jwtVerify(token, publicKey, {
        issuer,
        audience: AUDIENCE,
        algorithms: ['EdDSA'],
        currentDate: new Date(now),
      })
      return payload as unknown as AccessClaims
    },
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Secreto opaco de alta entropia (refresh token, device token). */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

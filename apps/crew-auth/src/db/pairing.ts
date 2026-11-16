import { randomInt, randomUUID } from 'node:crypto'
import { sha256Hex } from '../auth/tokens.js'
import type { Db } from './index.js'

// Sin caracteres ambiguos (0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LEN = 8

export const normalizePairingCode = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Crea un codigo de un solo uso; solo se guarda su hash. */
export function insertPairingCode(
  db: Db,
  now: number,
  ttlMs: number,
  input: { branchId: string; deviceName: string; createdBy: string },
): { code: string; expiresAt: number } {
  let code = ''
  for (let i = 0; i < CODE_LEN; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  const expiresAt = now + ttlMs
  const creator = db.prepare('SELECT restaurant_id FROM users WHERE id = ?').get(input.createdBy) as
    | { restaurant_id: string }
    | undefined
  db.prepare(
    `INSERT INTO pairing_codes (id, code_hash, branch_id, restaurant_id, device_name, created_by, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    sha256Hex(code),
    input.branchId,
    creator?.restaurant_id ?? null,
    input.deviceName,
    input.createdBy,
    expiresAt,
    now,
    now,
  )
  return { code, expiresAt }
}

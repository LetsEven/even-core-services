import { randomUUID } from 'node:crypto'
import { hashPin } from '../auth/pin.js'
import type { Role } from '../auth/roles.js'
import type { Db } from './index.js'

export interface UserRow {
  id: string
  branch_id: string
  restaurant_id: string
  name: string
  role: Role
  pin_hash: string
  pin_salt: string
  active: number
  cocina_operar: number
  failed_attempts: number
  locked_until: number | null
  lock_count: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

/** Vista publica: jamas incluye pin_hash ni pin_salt. */
export interface PublicUser {
  id: string
  name: string
  role: Role
  branchId: string
  restaurantId: string
  active: boolean
  cocinaOperar: boolean
  lockedUntil: number | null
  createdAt: number
  updatedAt: number
}

/** `lockedUntil`: el bloqueo vigente mas largo (global o de algun dispositivo), o null. */
export function toPublicUser(u: UserRow, lockedUntil: number | null = u.locked_until): PublicUser {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    branchId: u.branch_id,
    restaurantId: u.restaurant_id,
    active: u.active === 1,
    cocinaOperar: u.cocina_operar === 1,
    lockedUntil,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  }
}

/** Bloqueo vigente de un usuario: el mayor entre el global y los de sus dispositivos. */
export function activeLockUntil(db: Db, u: Pick<UserRow, 'id' | 'locked_until'>, now: number): number | null {
  const dev = db
    .prepare('SELECT MAX(locked_until) AS until FROM user_device_attempts WHERE user_id = ? AND locked_until > ?')
    .get(u.id, now) as { until: number | null }
  const all = [u.locked_until, dev.until].filter((x): x is number => x !== null && x > now)
  return all.length ? Math.max(...all) : null
}

export function getUser(db: Db, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(id) as UserRow | undefined
}

export interface NewUser {
  id?: string
  branchId: string
  restaurantId: string
  name: string
  role: Role
  pin: string
  cocinaOperar?: boolean
  /** config.pinPepper */
  pinPepper: string
}

export async function insertUser(db: Db, now: number, input: NewUser): Promise<UserRow> {
  const { hash, salt } = await hashPin(input.pin, input.pinPepper)
  const id = input.id ?? randomUUID()
  db.prepare(
    `INSERT INTO users (id, branch_id, restaurant_id, name, role, pin_hash, pin_salt, cocina_operar, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.branchId, input.restaurantId, input.name, input.role, hash, salt, input.cocinaOperar ? 1 : 0, now, now)
  return getUser(db, id) as UserRow
}

export function revokeUserSessions(db: Db, now: number, userId: string): void {
  db.prepare('UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
    now,
    now,
    userId,
  )
}

export function countActiveSupers(db: Db, restaurantId: string, excludeId?: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM users
       WHERE restaurant_id = ? AND role = 'super' AND active = 1 AND deleted_at IS NULL AND id != ?`,
    )
    .get(restaurantId, excludeId ?? '') as { n: number }
  return row.n
}

export function branchBelongsToRestaurant(db: Db, branchId: string, restaurantId: string): boolean {
  return (
    db
      .prepare('SELECT 1 AS ok FROM users WHERE branch_id = ? AND restaurant_id = ? AND deleted_at IS NULL LIMIT 1')
      .get(branchId, restaurantId) !== undefined
  )
}

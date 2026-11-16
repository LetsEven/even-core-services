import type { Config } from '../config.js'
import type { Db } from '../db/index.js'

// Lockout con reserva atomica del intento ANTES de verificar el PIN (scrypt tarda y es asincrono:
// sin reserva, N peticiones en paralelo pasarian todas la comprobacion de bloqueo).
//
// Dos contadores, ambos con ciclos de `max` intentos:
//  - por (usuario, dispositivo): umbral bajo (5). Un dispositivo no puede bloquear al usuario en los demas.
//  - por usuario (todos los dispositivos): umbral alto (15), para frenar el ataque repartido.
// Los contadores NO se reinician al bloquear (solo con un login exitoso, un reset de PIN o un unlock);
// cada bloqueo duplica la espera (backoff exponencial, con tope). El ciclo n permite hasta n*max fallos
// acumulados: la reserva falla si el contador ya alcanzo el tope del ciclo (sin verificar el PIN) o si
// hay un bloqueo vigente.

export type Scope = 'device' | 'user'

export interface Reservation {
  device: { attempts: number; lockCount: number }
  user: { attempts: number; lockCount: number }
}

export type ReserveResult = { ok: true; reservation: Reservation } | { ok: false; scope: Scope }

class Blocked extends Error {
  constructor(readonly scope: Scope) {
    super('blocked')
  }
}

type Limits = Pick<Config, 'maxFailedAttempts' | 'maxFailedAttemptsUser' | 'lockoutMs' | 'lockoutMaxMs'>

export function backoffMs(cfg: Pick<Config, 'lockoutMs' | 'lockoutMaxMs'>, lockCount: number): number {
  return Math.min(cfg.lockoutMs * 2 ** Math.min(lockCount, 30), cfg.lockoutMaxMs)
}

export function reserveAttempt(db: Db, cfg: Limits, userId: string, deviceId: string, t: number): ReserveResult {
  try {
    return db.transaction((): ReserveResult => {
      const dev = db
        .prepare(
          `INSERT INTO user_device_attempts (user_id, device_id, failed_attempts, updated_at) VALUES (?, ?, 1, ?)
           ON CONFLICT (user_id, device_id) DO UPDATE SET failed_attempts = failed_attempts + 1, updated_at = excluded.updated_at
           WHERE (locked_until IS NULL OR locked_until <= ?) AND failed_attempts < (lock_count + 1) * ?
           RETURNING failed_attempts, lock_count`,
        )
        .get(userId, deviceId, t, t, cfg.maxFailedAttempts) as { failed_attempts: number; lock_count: number } | undefined
      if (!dev) throw new Blocked('device')
      const usr = db
        .prepare(
          `UPDATE users SET failed_attempts = failed_attempts + 1, updated_at = ?
           WHERE id = ? AND (locked_until IS NULL OR locked_until <= ?) AND failed_attempts < (lock_count + 1) * ?
           RETURNING failed_attempts, lock_count`,
        )
        .get(t, userId, t, cfg.maxFailedAttemptsUser) as { failed_attempts: number; lock_count: number } | undefined
      // Se lanza dentro de la transaccion: deshace tambien el incremento del dispositivo.
      if (!usr) throw new Blocked('user')
      return {
        ok: true,
        reservation: {
          device: { attempts: dev.failed_attempts, lockCount: dev.lock_count },
          user: { attempts: usr.failed_attempts, lockCount: usr.lock_count },
        },
      }
    })()
  } catch (e) {
    if (e instanceof Blocked) return { ok: false, scope: e.scope }
    throw e
  }
}

/** Tras un PIN incorrecto: bloquea el ambito cuyo ciclo se agoto. Devuelve los bloqueos aplicados. */
export function applyFailure(
  db: Db,
  cfg: Limits,
  userId: string,
  deviceId: string,
  r: Reservation,
  t: number,
): { scope: Scope; until: number; lockCount: number }[] {
  const locks: { scope: Scope; until: number; lockCount: number }[] = []
  if (r.device.attempts >= (r.device.lockCount + 1) * cfg.maxFailedAttempts) {
    const until = t + backoffMs(cfg, r.device.lockCount)
    db.prepare(
      'UPDATE user_device_attempts SET locked_until = ?, lock_count = lock_count + 1, updated_at = ? WHERE user_id = ? AND device_id = ?',
    ).run(until, t, userId, deviceId)
    locks.push({ scope: 'device', until, lockCount: r.device.lockCount + 1 })
  }
  if (r.user.attempts >= (r.user.lockCount + 1) * cfg.maxFailedAttemptsUser) {
    const until = t + backoffMs(cfg, r.user.lockCount)
    db.prepare('UPDATE users SET locked_until = ?, lock_count = lock_count + 1, updated_at = ? WHERE id = ?').run(until, t, userId)
    locks.push({ scope: 'user', until, lockCount: r.user.lockCount + 1 })
  }
  return locks
}

/** Login exitoso: reinicia el contador del usuario y el de este dispositivo. */
export function resetOnSuccess(db: Db, userId: string, deviceId: string, t: number): void {
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, lock_count = 0, updated_at = ? WHERE id = ?').run(t, userId)
  db.prepare('DELETE FROM user_device_attempts WHERE user_id = ? AND device_id = ?').run(userId, deviceId)
}

/** Unlock / reset de PIN: limpia todos los contadores del usuario (todos los dispositivos). */
export function clearLockout(db: Db, userId: string, t: number): void {
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, lock_count = 0, updated_at = ? WHERE id = ?').run(t, userId)
  db.prepare('DELETE FROM user_device_attempts WHERE user_id = ?').run(userId)
}

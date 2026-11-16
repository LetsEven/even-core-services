import { z } from 'zod'
import { pinSchemaFor, superPinSchema } from './auth/pin.js'
import { ROLES } from './auth/roles.js'
import { writeAudit } from './db/audit.js'
import type { Db } from './db/index.js'
import { insertPairingCode } from './db/pairing.js'
import { insertUser } from './db/users.js'

// Alta inicial opt-in para entornos sin acceso a shell (p. ej. Railway dev).
// Se activa SOLO si CREW_AUTH_BOOTSTRAP_JSON esta definida. Es idempotente: no duplica usuarios
// (mismo restaurante + sucursal + nombre) ni toca los PIN de los que ya existen.
// Los PIN viajan en una variable de entorno: usar unicamente en dev/staging; en produccion usar el CLI create-super.
const bootstrapSchema = z.object({
  restaurantId: z.string().min(1),
  branchId: z.string().min(1),
  users: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        role: z.enum(ROLES),
        pin: z.string(),
        cocinaOperar: z.boolean().optional(),
      }),
    )
    .min(1),
  /** Genera un codigo de vinculacion al arrancar (se imprime en logs). Minutos de vigencia. */
  pairingCodeMinutes: z.number().int().min(1).max(240).optional(),
})

export type BootstrapInput = z.infer<typeof bootstrapSchema>

export interface BootstrapResult {
  created: string[]
  skipped: string[]
  pairingCode?: { code: string; expiresAt: number }
}

export async function runBootstrap(
  db: Db,
  raw: string,
  pinPepper: string,
  now = Date.now(),
): Promise<BootstrapResult> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error('CREW_AUTH_BOOTSTRAP_JSON no es JSON valido')
  }
  const input = bootstrapSchema.parse(json)
  for (const u of input.users) {
    const ok = (u.role === 'super' ? superPinSchema : pinSchemaFor(u.role)).safeParse(u.pin).success
    if (!ok) throw new Error(`PIN invalido para "${u.name}" (${u.role})`)
  }

  const result: BootstrapResult = { created: [], skipped: [] }
  let anyUserId: string | null = null
  for (const u of input.users) {
    const existing = db
      .prepare(
        'SELECT id FROM users WHERE restaurant_id = ? AND branch_id = ? AND name = ? AND deleted_at IS NULL',
      )
      .get(input.restaurantId, input.branchId, u.name) as { id: string } | undefined
    if (existing) {
      result.skipped.push(`${u.name} (${u.role})`)
      anyUserId ??= existing.id
      continue
    }
    const row = await insertUser(db, now, {
      branchId: input.branchId,
      restaurantId: input.restaurantId,
      name: u.name,
      role: u.role,
      pin: u.pin,
      cocinaOperar: u.cocinaOperar,
      pinPepper,
    })
    writeAudit(db, now, {
      restaurantId: row.restaurant_id,
      actorId: null,
      action: 'user.bootstrap',
      target: row.id,
      meta: { role: u.role },
    })
    result.created.push(`${u.name} (${u.role})`)
    anyUserId ??= row.id
  }

  if (input.pairingCodeMinutes && anyUserId) {
    result.pairingCode = insertPairingCode(db, now, input.pairingCodeMinutes * 60_000, {
      branchId: input.branchId,
      deviceName: 'Dispositivo (bootstrap)',
      createdBy: anyUserId,
    })
  }
  return result
}

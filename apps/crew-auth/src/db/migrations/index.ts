import { migration001 } from './001_init.js'
import { migration002 } from './002_devices.js'
import { migration003 } from './003_lockout.js'
import { migration004 } from './004_sessions.js'
import { migration005 } from './005_audit_restaurant.js'

export interface Migration {
  version: number
  name: string
  sql: string
}

/** Lista ordenada y append-only: nunca editar una migracion ya publicada. */
export const migrations: Migration[] = [migration001, migration002, migration003, migration004, migration005]

import { migration001 } from './001_init.js'
import { migration002 } from './002_devices.js'

export interface Migration {
  version: number
  name: string
  sql: string
}

/** Lista ordenada y append-only: nunca editar una migracion ya publicada. */
export const migrations: Migration[] = [migration001, migration002]

import type { Config } from './config.js'
import type { Db } from './db/index.js'
import type { Permission, Role } from './auth/roles.js'
import type { Signer } from './auth/tokens.js'

export interface Deps {
  db: Db
  config: Config
  signer: Signer
  /** Reloj inyectable (ms epoch); permite probar expiraciones. */
  now: () => number
}

export interface DeviceCtx {
  id: string
  branchId: string
  name: string
}

export interface AuthCtx {
  userId: string
  role: Role
  permissions: Permission[]
  branchId: string
  restaurantId: string
  deviceId: string
  sid: string
}

export interface AppEnv {
  Variables: {
    device: DeviceCtx
    auth: AuthCtx
  }
}

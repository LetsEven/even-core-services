// Fuente unica de roles y permisos de Crew (copia fiel del contrato).
// Debe mantenerse identica a la del frontend y el backend.

export const ROLES = ['super', 'cajero', 'mesero', 'cocina'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'mesas.ver',
  'comanda.crear',
  'cuenta.ver',
  'cuenta.cobrar',
  'cocina.ver',
  'cocina.operar',
  'caja.ver',
  'caja.resumen',
  'ajustes.ver',
  'ajustes.impresoras',
  'usuarios.administrar',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const MESERO: readonly Permission[] = ['mesas.ver', 'comanda.crear', 'cuenta.ver', 'cuenta.cobrar']

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  // mesero: mesas.ver, comanda.crear, cuenta.ver, cuenta.cobrar
  mesero: MESERO,
  // cajero: lo del mesero + caja.ver, caja.resumen
  cajero: [...MESERO, 'caja.ver', 'caja.resumen'],
  // cocina: cocina.ver (solo lectura de actividad); cocina.operar es opcional por usuario
  cocina: ['cocina.ver'],
  // super: todo
  super: PERMISSIONS,
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** Permisos efectivos de un usuario. `cocinaOperar` solo aplica al rol cocina. */
export function permissionsFor(role: Role, opts: { cocinaOperar?: boolean } = {}): Permission[] {
  const base = [...ROLE_PERMISSIONS[role]]
  if (role === 'cocina' && opts.cocinaOperar && !base.includes('cocina.operar')) {
    base.push('cocina.operar')
  }
  return base
}

export function hasPermission(permissions: readonly string[], required: Permission): boolean {
  return permissions.includes(required)
}

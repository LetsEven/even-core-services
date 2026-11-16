// Roles y permisos de Crew. Fuente de verdad: contrato crew-auth (roles y
// permisos como strings). El backend aplica los mismos permisos; aquí solo se
// usan para mostrar u ocultar UI y proteger rutas.

export const ROLES = ["super", "cajero", "mesero", "cocina"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "mesas.ver",
  "comanda.crear",
  "cuenta.ver",
  "cuenta.cobrar",
  "cocina.ver",
  "cocina.operar",
  "caja.ver",
  "caja.resumen",
  "ajustes.ver",
  "ajustes.impresoras",
  "usuarios.administrar",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MESERO: readonly Permission[] = [
  "mesas.ver",
  "comanda.crear",
  "cuenta.ver",
  "cuenta.cobrar",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super: PERMISSIONS,
  cajero: [...MESERO, "caja.ver", "caja.resumen"],
  mesero: MESERO,
  // Solo lectura de la actividad; `cocina.operar` se concede por usuario.
  cocina: ["cocina.ver"],
};

export const ROLE_LABELS: Record<Role, string> = {
  super: "Gerente",
  cajero: "Cajero",
  mesero: "Mesero",
  cocina: "Cocina",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isPermission(value: unknown): value is Permission {
  return (
    typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value)
  );
}

export function permissionsForRole(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Rol de una cuenta de Clerk: `publicMetadata.crewRole`. Sin valor (cuentas
 * actuales) es `super`, para no romperlas. Un valor presente pero invalido cae
 * al rol de menor privilegio (`cocina`, solo lectura), nunca a `super`.
 */
export function roleFromClerkMetadata(metadata: unknown): Role {
  const raw =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).crewRole
      : undefined;
  if (raw === undefined || raw === null || raw === "") return "super";
  return isRole(raw) ? raw : "cocina";
}

// Mapa ruta -> permiso requerido (patrones de React Router).
export const ROUTE_PERMISSIONS = {
  "/mesas": "mesas.ver",
  "/mesas/:unidad": "cuenta.ver",
  "/mesas/:unidad/comanda": "comanda.crear",
  "/cocina": "cocina.ver",
  "/caja": "caja.ver",
  "/caja/comprobantes": "caja.ver",
  "/caja/resumen": "caja.resumen",
  "/ajustes": "ajustes.ver",
  "/ajustes/impresoras": "ajustes.impresoras",
  "/ajustes/dispositivos": "ajustes.impresoras",
} as const satisfies Record<string, Permission>;
export type GuardedRoute = keyof typeof ROUTE_PERMISSIONS;

// Orden de preferencia para la vista inicial de un rol.
const HOME_ORDER: readonly GuardedRoute[] = [
  "/mesas",
  "/cocina",
  "/caja",
  "/ajustes",
];

/** Primera vista de nivel superior que el rol puede ver, o null. */
export function firstAllowedPath(
  has: (p: Permission) => boolean,
  preferred?: GuardedRoute,
): GuardedRoute | null {
  if (preferred && has(ROUTE_PERMISSIONS[preferred])) return preferred;
  return HOME_ORDER.find((r) => has(ROUTE_PERMISSIONS[r])) ?? null;
}

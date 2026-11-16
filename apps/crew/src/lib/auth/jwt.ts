import { isPermission, isRole, type Permission, type Role } from "./roles";

export interface AccessClaims {
  sub: string;
  role: Role;
  permissions: Permission[];
  /** Expiracion en ms epoch. */
  expiresAt: number;
  branchId: string | null;
}

/**
 * Lee los claims del access token SIN verificar la firma: el cliente solo los
 * usa para la UI; la verificacion (JWKS) la hace el backend en cada request.
 * Devuelve null si el token no tiene la forma esperada.
 */
export function decodeAccessClaims(token: string): AccessClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) =>
        c.charCodeAt(0),
      ),
    );
    const c = JSON.parse(json) as Record<string, unknown>;
    if (typeof c.sub !== "string" || !isRole(c.role) || typeof c.exp !== "number") {
      return null;
    }
    const permissions = Array.isArray(c.permissions)
      ? c.permissions.filter(isPermission)
      : [];
    return {
      sub: c.sub,
      role: c.role,
      permissions,
      expiresAt: c.exp * 1000,
      branchId: typeof c.branchId === "string" ? c.branchId : null,
    };
  } catch {
    return null;
  }
}

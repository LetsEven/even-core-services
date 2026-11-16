import { createContext, useContext } from "react";
import type { Permission } from "./roles";
import type { AuthProvider, AuthUser } from "./types";

export const AuthContext = createContext<AuthProvider | null>(null);

/** Sesion actual de Crew, sin importar el adaptador (clerk, local o demo). */
export function useAuth(): AuthProvider {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de un proveedor de auth");
  return ctx;
}

/** hasPermission a partir del usuario (compartido por los adaptadores). */
export function makeHasPermission(
  user: AuthUser | null,
): (permission: Permission) => boolean {
  return (permission) => !!user && user.permissions.includes(permission);
}

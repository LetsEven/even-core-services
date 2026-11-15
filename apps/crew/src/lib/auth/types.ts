import type { Permission, Role } from "./roles";

export type AuthStatus = "loading" | "signedOut" | "signedIn";
export type AuthKind = "clerk" | "local" | "demo";

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  permissions: Permission[];
}

/**
 * Contrato unico de autenticacion para la app. Todo el codigo fuera de
 * src/lib/auth usa solo esto (via useAuth); los adaptadores (clerk, local,
 * demo) lo implementan. `kind` indica el adaptador activo.
 */
export interface AuthProvider {
  kind: AuthKind;
  status: AuthStatus;
  user: AuthUser | null;
  /** Token Bearer para el backend (null sin sesion). Identidad estable. */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
}

// Punto de entrada de la autenticacion de Crew: el resto de la app solo usa
// useAuth(). Los adaptadores (clerk, local, demo) se cargan con import()
// dinamico desde main.tsx segun VITE_AUTH_PROVIDER, asi un build no incluye
// los que no usa.
export { AuthContext, useAuth, makeHasPermission } from "./context";
export type { AuthKind, AuthProvider, AuthStatus, AuthUser } from "./types";
export * from "./roles";
export { resolveAuthProvider } from "./select";

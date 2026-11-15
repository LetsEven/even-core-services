import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../lib/auth";

export function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-even-evergreen">
      <div
        role="status"
        aria-label="Cargando"
        className="w-8 h-8 border-4 border-white/15 border-t-even-grass rounded-full animate-spin"
      />
    </div>
  );
}

// Rutas protegidas: sin sesión de Clerk redirige a /login (recordando a dónde
// iba, para volver tras iniciar sesión).
export function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  if (!isLoaded) return <AppLoader />;
  if (!isSignedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

// /login: con sesión activa manda a la ruta pedida originalmente (o a "/").
export function LoginGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  if (!isLoaded) return <AppLoader />;
  if (isSignedIn) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }
  return <>{children}</>;
}

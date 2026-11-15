import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import { firstAllowedPath, useAuth, type Permission } from "../lib/auth";

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

// Rutas protegidas: sin sesión redirige a /login (recordando a dónde
// iba, para volver tras iniciar sesión).
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <AppLoader />;
  if (status === "signedOut") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

// /login: con sesión activa manda a la ruta pedida originalmente (o a "/").
export function LoginGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <AppLoader />;
  if (status === "signedIn") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }
  return <>{children}</>;
}

// Pantalla para quien tiene sesion pero no el permiso de la vista.
export function NoAccess() {
  const { user, hasPermission } = useAuth();
  const home = firstAllowedPath(hasPermission);
  return (
    <div
      role="alert"
      className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 bg-even-offwhite text-even-evergreen"
    >
      <h1 className="font-medium text-lg uppercase tracking-widest">Sin acceso</h1>
      <p className="text-sm text-even-evergreen/60 max-w-xs">
        {user ? `${user.name} no tiene permiso para ver esta pantalla.` : "No tienes permiso para ver esta pantalla."}
      </p>
      {home && (
        <Link to={home} replace className="text-xs uppercase tracking-wider underline">
          Ir al inicio
        </Link>
      )}
    </div>
  );
}

// Protege una ruta por permiso: con children envuelve un elemento; sin ellos
// actua como ruta de diseño (Outlet). El backend aplica el mismo permiso.
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children?: ReactNode;
}) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) return <NoAccess />;
  return <>{children ?? <Outlet />}</>;
}

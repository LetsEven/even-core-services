import type { ReactElement } from "react";
import { Navigate, Outlet, createBrowserRouter, createHashRouter } from "react-router";
import type { RouteObject } from "react-router";
import { isTauri } from "../lib/platform";
import SessionProvider from "./session/SessionProvider";
import { LoginGate, RequireAuth, RequirePermission } from "./guards";
import { ROUTE_PERMISSIONS, type GuardedRoute } from "../lib/auth";
import LoginPage from "./LoginPage";
import AppShell from "./AppShell";
import CajaLayout from "./CajaLayout";
import ResumenPage from "../routes/caja/ResumenPage";
import AjustesPage from "./AjustesPage";
import ComandaPage from "../routes/mesas/ComandaPage";
import CuentaPage from "../routes/mesas/CuentaPage";
import {
  CocinaPage,
  ComprobantesPage,
  DevicesPage,
  HistorialPage,
  HomeRedirect,
  MesasPage,
  PrintersPage,
} from "./pages";

function SessionLayout() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}

// Envuelve la pantalla de una ruta con el permiso que le asigna el mapa
// ROUTE_PERMISSIONS (lib/auth/roles.ts).
function guard(route: GuardedRoute, element: ReactElement) {
  return (
    <RequirePermission permission={ROUTE_PERMISSIONS[route]}>
      {element}
    </RequirePermission>
  );
}

export const routes: RouteObject[] = [
  {
    element: <SessionLayout />,
    children: [
      {
        path: "/login",
        element: (
          <LoginGate>
            <LoginPage />
          </LoginGate>
        ),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <HomeRedirect /> },
              { path: "mesas", element: guard("/mesas", <MesasPage />) },
              {
                path: "mesas/:unidad",
                element: guard("/mesas/:unidad", <CuentaPage />),
              },
              {
                path: "mesas/:unidad/comanda",
                element: guard("/mesas/:unidad/comanda", <ComandaPage />),
              },
              { path: "cocina", element: guard("/cocina", <CocinaPage />) },
              {
                path: "caja",
                element: guard("/caja", <CajaLayout />),
                children: [
                  { index: true, element: <HistorialPage /> },
                  { path: "comprobantes", element: <ComprobantesPage /> },
                  {
                    path: "resumen",
                    element: guard("/caja/resumen", <ResumenPage />),
                  },
                ],
              },
              { path: "ajustes", element: guard("/ajustes", <AjustesPage />) },
              {
                path: "ajustes/impresoras",
                element: guard("/ajustes/impresoras", <PrintersPage />),
              },
              {
                path: "ajustes/dispositivos",
                element: guard("/ajustes/dispositivos", <DevicesPage />),
              },
              { path: "*", element: <Navigate to="/" replace /> },
            ],
          },
        ],
      },
    ],
  },
];

// Tauri sirve desde un esquema propio: sin servidor que reescriba rutas, usa hash.
export const createAppRouter = () =>
  isTauri() ? createHashRouter(routes) : createBrowserRouter(routes);

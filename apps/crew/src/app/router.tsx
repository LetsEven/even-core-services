import { Navigate, Outlet, createBrowserRouter, createHashRouter } from "react-router";
import type { RouteObject } from "react-router";
import { isTauri } from "../lib/platform";
import SessionProvider from "./session/SessionProvider";
import { LoginGate, RequireAuth } from "./guards";
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
              { path: "mesas", element: <MesasPage /> },
              { path: "mesas/:unidad", element: <CuentaPage /> },
              {
                path: "mesas/:unidad/comanda",
                element: <ComandaPage />,
              },
              { path: "cocina", element: <CocinaPage /> },
              {
                path: "caja",
                element: <CajaLayout />,
                children: [
                  { index: true, element: <HistorialPage /> },
                  { path: "comprobantes", element: <ComprobantesPage /> },
                  { path: "resumen", element: <ResumenPage /> },
                ],
              },
              { path: "ajustes", element: <AjustesPage /> },
              { path: "ajustes/impresoras", element: <PrintersPage /> },
              { path: "ajustes/dispositivos", element: <DevicesPage /> },
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

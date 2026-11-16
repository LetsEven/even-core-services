// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router";
import type { RouteObject } from "react-router";

vi.mock("../lib/demoMode", () => ({
  isDemoMode: () => false,
  demoStatus: { active: false, error: null },
}));

// Pantallas reales reemplazadas por marcadores: aqui se prueba el cableado de
// permisos del router real, no el contenido de cada vista.
vi.mock("./session/SessionProvider", () => ({ default: () => null }));
vi.mock("./LoginPage", () => ({ default: () => null }));
vi.mock("./AppShell", () => ({ default: () => null }));
vi.mock("./AjustesPage", () => ({ default: () => <p>pantalla ajustes</p> }));
vi.mock("../routes/mesas/ComandaPage", () => ({ default: () => <p>pantalla comanda</p> }));
vi.mock("../routes/mesas/CuentaPage", () => ({ default: () => <p>pantalla cuenta</p> }));
vi.mock("../routes/caja/ResumenPage", () => ({ default: () => <p>pantalla resumen</p> }));
vi.mock("./CajaLayout", () => ({ default: () => <Outlet /> }));
vi.mock("../pages/Historial", () => ({ default: () => <p>pantalla ordenes</p> }));
vi.mock("../pages/Comprobantes", () => ({ default: () => <p>pantalla comprobantes</p> }));
vi.mock("../pages/Printers", () => ({ default: () => <p>pantalla impresoras</p> }));
vi.mock("../components/DevicesPanel", () => ({ default: () => <p>panel dispositivos</p> }));
vi.mock("../services/registry", () => ({
  SERVICE_REGISTRY: {
    flex_bill: { HomeScreen: () => <p>pantalla mesas</p> },
  },
}));
vi.mock("../services/homeScreens", () => ({
  PickAndGoHome: ({ readOnly }: { readOnly?: boolean }) => (
    <p>pantalla cocina {readOnly ? "solo lectura" : "operable"}</p>
  ),
}));

import { routes } from "./router";
import { SessionContext, type SessionValue } from "./session/context";
import {
  AuthContext,
  ROLE_PERMISSIONS,
  makeHasPermission,
  type AuthProvider,
  type Permission,
  type Role,
} from "../lib/auth";

// Las rutas de la app autenticada (hijas de AppShell) en un router de pruebas.
function appRoutes(): RouteObject[] {
  const session = routes[0].children!;
  const requireAuth = session.find((r) => !r.path)!;
  const shell = requireAuth.children![0];
  return shell.children!;
}

function authFor(role: Role, extra: Permission[] = []): AuthProvider {
  const user = {
    id: "u",
    name: "Test",
    role,
    permissions: [...ROLE_PERMISSIONS[role], ...extra],
  };
  return {
    kind: "local",
    status: "signedIn",
    user,
    getToken: async () => "t",
    signOut: async () => {},
    hasPermission: makeHasPermission(user),
  };
}

function renderAs(role: Role, path: string, extra: Permission[] = []) {
  const router = createMemoryRouter(appRoutes(), { initialEntries: [path] });
  const session = {
    branchesLoading: false,
    currentBranch: { id: "b" },
    activeOrderTypes: ["flex_bill"],
    resolvedOrderType: "flex_bill",
  } as unknown as SessionValue;
  render(
    <AuthContext.Provider value={authFor(role, extra)}>
      <SessionContext.Provider value={session}>
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </AuthContext.Provider>,
  );
  return router;
}

afterEach(cleanup);

const NO_ACCESS = "Sin acceso";

describe("guards de ruta por permiso", () => {
  it("mesero no entra a /cocina ni a /caja/resumen", () => {
    renderAs("mesero", "/cocina");
    expect(screen.getByText(NO_ACCESS)).toBeTruthy();
    expect(screen.queryByText(/pantalla cocina/)).toBeNull();
    cleanup();

    renderAs("mesero", "/caja/resumen");
    expect(screen.getByText(NO_ACCESS)).toBeTruthy();
    expect(screen.queryByText("pantalla resumen")).toBeNull();
  });

  it("mesero tampoco entra a Caja ni a Ajustes, pero si a Mesas, cuenta y comanda", () => {
    renderAs("mesero", "/caja");
    expect(screen.getByText(NO_ACCESS)).toBeTruthy();
    cleanup();
    renderAs("mesero", "/ajustes");
    expect(screen.getByText(NO_ACCESS)).toBeTruthy();
    cleanup();
    renderAs("mesero", "/ajustes/impresoras");
    expect(screen.getByText(NO_ACCESS)).toBeTruthy();
    cleanup();
    renderAs("mesero", "/mesas");
    expect(screen.getByText("pantalla mesas")).toBeTruthy();
    cleanup();
    renderAs("mesero", "/mesas/5");
    expect(screen.getByText("pantalla cuenta")).toBeTruthy();
    cleanup();
    renderAs("mesero", "/mesas/5/comanda");
    expect(screen.getByText("pantalla comanda")).toBeTruthy();
  });

  it("cocina: solo /cocina, de solo lectura; no entra a mesas, comanda, cuenta ni caja", () => {
    renderAs("cocina", "/cocina");
    expect(screen.getByText("pantalla cocina solo lectura")).toBeTruthy();
    for (const path of ["/mesas", "/mesas/5", "/mesas/5/comanda", "/caja", "/caja/comprobantes", "/ajustes"]) {
      cleanup();
      renderAs("cocina", path);
      expect(screen.getByText(NO_ACCESS), path).toBeTruthy();
    }
  });

  it("cocina con cocina.operar opera el tablero", () => {
    renderAs("cocina", "/cocina", ["cocina.operar"]);
    expect(screen.getByText("pantalla cocina operable")).toBeTruthy();
  });

  it("cajero ve Caja y Resumen, no Cocina ni Ajustes", () => {
    renderAs("cajero", "/caja/resumen");
    expect(screen.getByText("pantalla resumen")).toBeTruthy();
    cleanup();
    renderAs("cajero", "/caja/comprobantes");
    expect(screen.getByText("pantalla comprobantes")).toBeTruthy();
    cleanup();
    renderAs("cajero", "/cocina");
    expect(screen.getByText(NO_ACCESS)).toBeTruthy();
    cleanup();
    renderAs("cajero", "/ajustes/dispositivos");
    expect(screen.getByText(NO_ACCESS)).toBeTruthy();
  });

  it("super entra a todo", () => {
    const all: [string, string][] = [
      ["/mesas", "pantalla mesas"],
      ["/mesas/5", "pantalla cuenta"],
      ["/mesas/5/comanda", "pantalla comanda"],
      ["/caja", "pantalla ordenes"],
      ["/caja/comprobantes", "pantalla comprobantes"],
      ["/caja/resumen", "pantalla resumen"],
      ["/ajustes", "pantalla ajustes"],
      ["/ajustes/impresoras", "pantalla impresoras"],
      ["/ajustes/dispositivos", "panel dispositivos"],
    ];
    for (const [path, text] of all) {
      cleanup();
      renderAs("super", path);
      expect(screen.getByText(text), path).toBeTruthy();
    }
    cleanup();
    renderAs("super", "/cocina");
    expect(screen.getByText("pantalla cocina operable")).toBeTruthy();
  });

  it("la ruta inicial lleva a la primera vista permitida (cocina -> /cocina)", () => {
    expect(renderAs("cocina", "/").state.location.pathname).toBe("/cocina");
    cleanup();
    expect(renderAs("mesero", "/").state.location.pathname).toBe("/mesas");
    cleanup();
    expect(renderAs("cajero", "/").state.location.pathname).toBe("/mesas");
  });
});

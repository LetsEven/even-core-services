// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";

// Estos guards se prueban con una sesion inyectada (AuthContext), sin Clerk ni
// red; aunque el build corra con VITE_DEMO_MODE=true, aqui el modo demo va apagado.
vi.mock("../lib/demoMode", () => ({
  isDemoMode: () => false,
  demoStatus: { active: false, error: null },
}));

const auth = vi.hoisted(() => ({
  state: { status: "signedOut" as "loading" | "signedOut" | "signedIn" },
}));

import { LoginGate, RequireAuth } from "./guards";
import { AuthContext, makeHasPermission, permissionsForRole, type AuthProvider } from "../lib/auth";
import { HomeRedirect } from "./pages";
import { SessionContext, type SessionValue } from "./session/context";

vi.mock("../pages/Kitchen", () => ({ default: () => null }));
vi.mock("../pages/Printers", () => ({ default: () => null }));
vi.mock("../pages/Historial", () => ({ default: () => null }));
vi.mock("../pages/Comprobantes", () => ({ default: () => null }));
vi.mock("../components/TablesBoard", () => ({ default: () => null }));

function authValue(status: AuthProvider["status"], role: "super" | "mesero" = "super"): AuthProvider {
  const user =
    status === "signedIn"
      ? { id: "u", name: "Test", role, permissions: permissionsForRole(role) }
      : null;
  return {
    kind: "clerk",
    status,
    user,
    getToken: async () => null,
    signOut: async () => {},
    hasPermission: makeHasPermission(user),
  };
}

function renderAt(path: string | { pathname: string; state: unknown }, session?: Partial<SessionValue>, role: "super" | "mesero" = "super") {
  const router = createMemoryRouter(
    [
      {
        path: "/login",
        element: (
          <LoginGate>
            <p>pantalla login</p>
          </LoginGate>
        ),
      },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: "mesas", element: <p>pantalla mesas</p> },
          { path: "cocina", element: <p>pantalla cocina</p> },
          { path: "caja", element: <p>pantalla caja</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <AuthContext.Provider value={authValue(auth.state.status, role)}>
      <SessionContext.Provider value={session as SessionValue}>
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </AuthContext.Provider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  auth.state = { status: "signedOut" };
});

describe("guard de login", () => {
  it("sin sesión redirige a /login y recuerda la ruta pedida", () => {
    const router = renderAt("/caja");
    expect(screen.getByText("pantalla login")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toEqual({ from: "/caja" });
  });

  it("mientras la sesión carga no redirige", () => {
    auth.state = { status: "loading" };
    const router = renderAt("/caja");
    expect(screen.getByRole("status")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/caja");
  });

  it("con sesión, /login regresa a la ruta pedida (o a /)", () => {
    auth.state = { status: "signedIn" };
    const router = renderAt("/login", {
      branchesLoading: false,
      currentBranch: { id: "b" } as SessionValue["currentBranch"],
      activeOrderTypes: ["tap_pay"],
    });
    expect(router.state.location.pathname).toBe("/mesas");
  });
});

describe("login tras cambiar de usuario", () => {
  const session = {
    branchesLoading: false,
    currentBranch: { id: "b" } as SessionValue["currentBranch"],
    activeOrderTypes: ["tap_pay"],
  };
  it("si la ruta previa no la ve el nuevo rol, va a su vista inicial", () => {
    auth.state = { status: "signedIn" };
    const router = renderAt({ pathname: "/login", state: { from: "/ajustes" } }, session, "mesero");
    expect(router.state.location.pathname).toBe("/mesas");
  });
  it("si la ruta previa si la ve, vuelve a ella", () => {
    auth.state = { status: "signedIn" };
    const router = renderAt({ pathname: "/login", state: { from: "/caja" } }, session, "super");
    expect(router.state.location.pathname).toBe("/caja");
  });
});

describe("redirección inicial", () => {
  const base = {
    branchesLoading: false,
    currentBranch: { id: "b" } as SessionValue["currentBranch"],
  };

  it("sucursal solo Pick & Go va a /cocina", () => {
    auth.state = { status: "signedIn" };
    const router = renderAt("/", { ...base, activeOrderTypes: ["pick_and_go"] });
    expect(router.state.location.pathname).toBe("/cocina");
  });

  it("sucursal con servicios de mesa va a /mesas", () => {
    auth.state = { status: "signedIn" };
    const router = renderAt("/", {
      ...base,
      activeOrderTypes: ["pick_and_go", "flex_bill"],
    });
    expect(router.state.location.pathname).toBe("/mesas");
  });
});

describe("rutas de Caja", () => {
  it("Órdenes, Comprobantes y Resumen son vistas hijas independientes", async () => {
    const { routes } = await import("./router");
    const find = (rs: typeof routes, path: string): (typeof routes)[number] | undefined => {
      for (const r of rs) {
        if (r.path === path) return r;
        const hit = r.children && find(r.children, path);
        if (hit) return hit;
      }
    };
    const caja = find(routes, "caja");
    const kids = caja?.children ?? [];
    expect(kids.some((c) => c.index)).toBe(true);
    expect(kids.map((c) => c.path).filter(Boolean)).toEqual(["comprobantes", "resumen"]);
  });
});

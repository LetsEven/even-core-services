// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";

const auth = vi.hoisted(() => ({
  state: { isLoaded: true, isSignedIn: false },
}));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => auth.state }));

import { LoginGate, RequireAuth } from "./guards";
import { HomeRedirect } from "./pages";
import { SessionContext, type SessionValue } from "./session/context";

vi.mock("../pages/Kitchen", () => ({ default: () => null }));
vi.mock("../pages/Printers", () => ({ default: () => null }));
vi.mock("../pages/Historial", () => ({ default: () => null }));
vi.mock("../pages/Comprobantes", () => ({ default: () => null }));
vi.mock("../components/SpatialGrid", () => ({ default: () => null }));

function renderAt(path: string, session?: Partial<SessionValue>) {
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
    <SessionContext.Provider value={session as SessionValue}>
      <RouterProvider router={router} />
    </SessionContext.Provider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  auth.state = { isLoaded: true, isSignedIn: false };
});

describe("guard de login", () => {
  it("sin sesión redirige a /login y recuerda la ruta pedida", () => {
    const router = renderAt("/caja");
    expect(screen.getByText("pantalla login")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toEqual({ from: "/caja" });
  });

  it("mientras Clerk carga no redirige", () => {
    auth.state = { isLoaded: false, isSignedIn: false };
    const router = renderAt("/caja");
    expect(screen.getByRole("status")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/caja");
  });

  it("con sesión, /login regresa a la ruta pedida (o a /)", () => {
    auth.state = { isLoaded: true, isSignedIn: true };
    const router = renderAt("/login", {
      branchesLoading: false,
      currentBranch: { id: "b" } as SessionValue["currentBranch"],
      activeOrderTypes: ["tap_pay"],
    });
    expect(router.state.location.pathname).toBe("/mesas");
  });
});

describe("redirección inicial", () => {
  const base = {
    branchesLoading: false,
    currentBranch: { id: "b" } as SessionValue["currentBranch"],
  };

  it("sucursal solo Pick & Go va a /cocina", () => {
    auth.state = { isLoaded: true, isSignedIn: true };
    const router = renderAt("/", { ...base, activeOrderTypes: ["pick_and_go"] });
    expect(router.state.location.pathname).toBe("/cocina");
  });

  it("sucursal con servicios de mesa va a /mesas", () => {
    auth.state = { isLoaded: true, isSignedIn: true };
    const router = renderAt("/", {
      ...base,
      activeOrderTypes: ["pick_and_go", "flex_bill"],
    });
    expect(router.state.location.pathname).toBe("/mesas");
  });
});

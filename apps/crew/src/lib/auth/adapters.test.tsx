// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

// --- Clerk simulado: el adaptador se prueba contra su API real de hooks. ---
const clerk = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => "clerk-jwt"), signOut: vi.fn(async () => {}) },
  user: { isLoaded: true, user: null as null | Record<string, unknown> },
}));
vi.mock("@clerk/clerk-react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => clerk.auth,
  useUser: () => clerk.user,
  useSignIn: () => ({}),
}));
vi.mock("../clerkNative", () => ({ createNativeClerk: () => ({}) }));

import { ClerkAuthProvider } from "./clerk";
import { LocalAuthProvider } from "./local";
import { DemoAuthProvider } from "../../demo/DemoAuth";
import { DemoAuthContext } from "../../demo/demoAuthContext";
import { useAuth } from "./context";
import { useLocalAuth } from "./localContext";
import { DEVICE_KEY, SESSION_KEY } from "./localSession";
import { jsonResponse, makeAccessToken } from "./testUtils";
import { ROLE_PERMISSIONS } from "./roles";

function Probe() {
  const a = useAuth();
  return (
    <div>
      <span data-testid="status">{a.status}</span>
      <span data-testid="kind">{a.kind}</span>
      <span data-testid="role">{a.user?.role ?? "-"}</span>
      <span data-testid="name">{a.user?.name ?? "-"}</span>
      <span data-testid="cobrar">{String(a.hasPermission("cuenta.cobrar"))}</span>
      <span data-testid="usuarios">{String(a.hasPermission("usuarios.administrar"))}</span>
      <button onClick={() => void a.signOut()}>salir</button>
      <button onClick={() => void a.getToken().then((t) => (document.title = String(t)))}>token</button>
    </div>
  );
}
const text = (id: string) => screen.getByTestId(id).textContent;

afterEach(() => {
  cleanup();
  document.title = "";
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("adaptador clerk", () => {
  const withUser = (publicMetadata: unknown) => {
    clerk.auth.isLoaded = true;
    clerk.auth.isSignedIn = true;
    clerk.user = { isLoaded: true, user: { id: "user_1", fullName: "Dueña Even", publicMetadata } };
    render(
      <ClerkAuthProvider publishableKey="pk_test">
        <Probe />
      </ClerkAuthProvider>,
    );
  };

  it("cuenta actual (sin crewRole): signedIn, rol super y todo accesible", () => {
    withUser({});
    expect(text("kind")).toBe("clerk");
    expect(text("status")).toBe("signedIn");
    expect(text("role")).toBe("super");
    expect(text("name")).toBe("Dueña Even");
    expect(text("cobrar")).toBe("true");
    expect(text("usuarios")).toBe("true");
  });

  it("el rol sale de publicMetadata.crewRole", () => {
    withUser({ crewRole: "mesero" });
    expect(text("role")).toBe("mesero");
    expect(text("cobrar")).toBe("true");
    expect(text("usuarios")).toBe("false");
  });

  it("getToken y signOut delegan en Clerk", async () => {
    withUser({});
    fireEvent.click(screen.getByText("token"));
    await waitFor(() => expect(document.title).toBe("clerk-jwt"));
    fireEvent.click(screen.getByText("salir"));
    expect(clerk.auth.signOut).toHaveBeenCalled();
  });

  it("estados loading y signedOut", () => {
    clerk.auth.isLoaded = false;
    clerk.auth.isSignedIn = false as boolean;
    clerk.user = { isLoaded: false, user: null };
    const { unmount } = render(
      <ClerkAuthProvider publishableKey="pk_test">
        <Probe />
      </ClerkAuthProvider>,
    );
    expect(text("status")).toBe("loading");
    unmount();

    clerk.auth.isLoaded = true;
    clerk.user = { isLoaded: true, user: null };
    render(
      <ClerkAuthProvider publishableKey="pk_test">
        <Probe />
      </ClerkAuthProvider>,
    );
    expect(text("status")).toBe("signedOut");
    expect(text("cobrar")).toBe("false");
  });

  it("con sesion pero usuario aun sin cargar sigue en loading (no concede super de mas)", () => {
    clerk.auth.isLoaded = true;
    clerk.auth.isSignedIn = true;
    clerk.user = { isLoaded: false, user: null };
    render(
      <ClerkAuthProvider publishableKey="pk_test">
        <Probe />
      </ClerkAuthProvider>,
    );
    expect(text("status")).toBe("loading");
  });
});

describe("adaptador demo", () => {
  function DemoProbe() {
    return (
      <>
        <Probe />
        <DemoAuthContext.Consumer>
          {(c) => <button onClick={() => c?.signIn()}>entrar</button>}
        </DemoAuthContext.Consumer>
      </>
    );
  }

  it("signedOut -> signIn -> rol super con token falso; signOut vuelve a signedOut", async () => {
    render(
      <DemoAuthProvider>
        <DemoProbe />
      </DemoAuthProvider>,
    );
    expect(text("kind")).toBe("demo");
    expect(text("status")).toBe("signedOut");
    fireEvent.click(screen.getByText("entrar"));
    expect(text("status")).toBe("signedIn");
    expect(text("role")).toBe("super");
    expect(text("usuarios")).toBe("true");
    fireEvent.click(screen.getByText("token"));
    await waitFor(() => expect(document.title).toBe("demo-token"));
    fireEvent.click(screen.getByText("salir"));
    expect(text("status")).toBe("signedOut");
  });

  it("el demo nunca llama a red", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    render(
      <DemoAuthProvider>
        <DemoProbe />
      </DemoAuthProvider>,
    );
    fireEvent.click(screen.getByText("entrar"));
    expect(f).not.toHaveBeenCalled();
  });
});

describe("adaptador local (proveedor React)", () => {
  const BASE = "https://auth.test";
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  function LocalProbe() {
    const l = useLocalAuth();
    return (
      <>
        <Probe />
        <span data-testid="paired">{String(l.paired)}</span>
        <button onClick={() => void l.pair("COD123")}>emparejar</button>
        <button onClick={() => void l.login("u1", "1234")}>login</button>
      </>
    );
  }
  const mount = () =>
    render(
      <LocalAuthProvider baseUrl={BASE}>
        <LocalProbe />
      </LocalAuthProvider>,
    );

  it("emparejar, entrar con PIN, usar el token y cerrar sesion (revoca)", async () => {
    mount();
    expect(text("kind")).toBe("local");
    expect(text("status")).toBe("signedOut");
    expect(text("paired")).toBe("false");

    fetchMock.mockResolvedValueOnce(jsonResponse({ deviceToken: "dev", branchId: "b1" }));
    fireEvent.click(screen.getByText("emparejar"));
    await waitFor(() => expect(text("paired")).toBe("true"));

    const access = makeAccessToken({ sub: "u1", role: "cajero", permissions: [...ROLE_PERMISSIONS.cajero] });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: access, refreshToken: "r1", user: { id: "u1", name: "Caro", role: "cajero" } }),
    );
    fireEvent.click(screen.getByText("login"));
    await waitFor(() => expect(text("status")).toBe("signedIn"));
    expect(text("role")).toBe("cajero");
    expect(text("name")).toBe("Caro");
    expect(text("cobrar")).toBe("true");
    expect(text("usuarios")).toBe("false");

    fireEvent.click(screen.getByText("token"));
    await waitFor(() => expect(document.title).toBe(access));

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByText("salir"));
    await waitFor(() => expect(text("status")).toBe("signedOut"));
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(`${BASE}/v1/logout`);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(DEVICE_KEY)).not.toBeNull();
  });

  it("restaura la sesion al montar con refresh token guardado", async () => {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ deviceToken: "dev", branchId: "b1" }));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ refreshToken: "r-old", name: "Mari" }));
    const access = makeAccessToken({ sub: "u2", role: "mesero" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: access, refreshToken: "r-new" }));
    mount();
    expect(text("status")).toBe("loading");
    await waitFor(() => expect(text("status")).toBe("signedIn"));
    expect(text("name")).toBe("Mari");
    expect(text("role")).toBe("mesero");
  });
});

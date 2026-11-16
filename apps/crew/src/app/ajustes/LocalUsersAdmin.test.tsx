// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../lib/demoMode", () => ({
  isDemoMode: () => false,
  demoStatus: { active: false, error: null },
}));
vi.mock("../../lib/webPush", () => ({
  enableWebPush: async () => "granted",
  getWebPushStatus: async () => "unsupported",
  removeWebPushToken: async () => {},
}));

import AjustesPage from "../AjustesPage";
import LocalUsersAdmin from "./LocalUsersAdmin";
import { SessionContext, type SessionValue } from "../session/context";
import { AuthContext, ROLE_PERMISSIONS, makeHasPermission, type AuthKind, type AuthProvider, type Role } from "../../lib/auth";
import { LocalAuthContext, type LocalAuthExtras } from "../../lib/auth/localContext";
import { createLocalClient } from "../../lib/auth/localClient";
import { jsonResponse } from "../../lib/auth/testUtils";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
});
afterEach(cleanup);

function authFor(role: Role, kind: AuthKind): AuthProvider {
  const user = { id: "me", name: "Gerente", role, permissions: [...ROLE_PERMISSIONS[role]] };
  return { kind, status: "signedIn", user, getToken: async () => "acc", signOut: async () => {}, hasPermission: makeHasPermission(user) };
}
const extras = (): LocalAuthExtras =>
  ({
    paired: true,
    branchId: "b1",
    client: createLocalClient({ baseUrl: "https://auth.test", fetchImpl: fetchMock as unknown as typeof fetch }),
  }) as LocalAuthExtras;

function mountAdmin() {
  render(
    <AuthContext.Provider value={authFor("super", "local")}>
      <LocalAuthContext.Provider value={extras()}>
        <LocalUsersAdmin />
      </LocalAuthContext.Provider>
    </AuthContext.Provider>,
  );
}
const adminUser = (id: string, name: string, role: Role, active = true) => ({
  id, name, role, active, branchId: "b1", restaurantId: "r1", cocinaOperar: false, lockedUntil: null, createdAt: 1, updatedAt: 1,
});
const bodyOf = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body);

describe("administracion de usuarios locales", () => {
  it("lista, crea, cambia rol, desactiva, resetea PIN y genera codigo", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        users: [
          adminUser("u1", "Ana", "mesero"),
          adminUser("me", "Gerente", "super"),
          { ...adminUser("x9", "Otra sucursal", "mesero"), branchId: "b2" },
        ],
      }),
    );
    mountAdmin();
    expect(await screen.findByText("Ana")).toBeTruthy();
    expect(screen.queryByText("Otra sucursal")).toBeNull(); // filtra por sucursal
    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.test/v1/admin/users");

    // Cambiar rol
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: adminUser("u1", "Ana", "cajero") }));
    fireEvent.change(screen.getByLabelText("Rol de Ana"), { target: { value: "cajero" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("https://auth.test/v1/users/u1");
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
    expect(bodyOf(1)).toEqual({ role: "cajero" });

    // Desactivar (a si mismo no se puede)
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: adminUser("u1", "Ana", "cajero", false) }));
    const buttons = screen.getAllByRole("button", { name: "Desactivar" }) as HTMLButtonElement[];
    expect(buttons[1].disabled).toBe(true);
    fireEvent.click(buttons[0]);
    expect(await screen.findByText("Inactivo")).toBeTruthy();
    expect(bodyOf(2)).toEqual({ active: false });

    // Resetear PIN
    fireEvent.click(screen.getAllByRole("button", { name: /Resetear PIN/ })[0]);
    fireEvent.change(screen.getByLabelText("Nuevo PIN de Ana"), { target: { value: "5678" } });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar PIN" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[3][0]).toBe("https://auth.test/v1/users/u1/reset-pin");
    expect(bodyOf(3)).toEqual({ pin: "5678" });

    // Crear usuario
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Beto" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "4321" } });
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: adminUser("u3", "Beto", "mesero") }, 201));
    fireEvent.click(screen.getByRole("button", { name: /Crear usuario/ }));
    expect(await screen.findByText("Beto")).toBeTruthy();
    expect(bodyOf(4)).toEqual({ branchId: "b1", name: "Beto", role: "mesero", pin: "4321" });

    // Codigo de emparejamiento
    fetchMock.mockResolvedValueOnce(jsonResponse({ pairingCode: "K7Q2XMAB", branchId: "b1", expiresAt: 1_900_000_000_000 }, 201));
    fireEvent.click(screen.getByRole("button", { name: /Generar código/ }));
    expect(await screen.findByText("K7Q2XMAB")).toBeTruthy();
  });

  it("un PIN invalido no se envia", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: [] }));
    mountAdmin();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Beto" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "12" } });
    expect((screen.getByRole("button", { name: /Crear usuario/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("un error del servicio muestra un mensaje generico", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "secreto interno" }, 500));
    mountAdmin();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });
});

describe("visibilidad en Ajustes", () => {
  const session = { waiterSession: null, requireWaiterLogin: () => {} } as unknown as SessionValue;
  function mountAjustes(role: Role, kind: AuthKind) {
    fetchMock.mockImplementation(async () => jsonResponse({ users: [] }));
    render(
      <AuthContext.Provider value={authFor(role, kind)}>
        <LocalAuthContext.Provider value={extras()}>
          <SessionContext.Provider value={session}>
            <MemoryRouter>
              <AjustesPage />
            </MemoryRouter>
          </SessionContext.Provider>
        </LocalAuthContext.Provider>
      </AuthContext.Provider>,
    );
  }

  it("provider local + usuarios.administrar: aparece la administracion", async () => {
    mountAjustes("super", "local");
    expect(await screen.findByLabelText("Usuarios del servicio local")).toBeTruthy();
  });

  it("con clerk no aparece, aunque sea super", () => {
    mountAjustes("super", "clerk");
    expect(screen.queryByLabelText("Usuarios del servicio local")).toBeNull();
    expect(screen.getByText("Impresoras")).toBeTruthy();
  });

  it("local sin usuarios.administrar no la ve", () => {
    mountAjustes("cajero", "local");
    expect(screen.queryByLabelText("Usuarios del servicio local")).toBeNull();
  });
});

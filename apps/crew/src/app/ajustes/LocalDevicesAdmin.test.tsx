// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import LocalDevicesAdmin from "./LocalDevicesAdmin";
import { AuthContext, ROLE_PERMISSIONS, makeHasPermission, type AuthProvider } from "../../lib/auth";
import { LocalAuthContext, type LocalAuthExtras } from "../../lib/auth/localContext";
import { createLocalClient } from "../../lib/auth/localClient";
import { jsonResponse } from "../../lib/auth/testUtils";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
});
afterEach(cleanup);

const user = { id: "me", name: "Gerente", role: "super" as const, permissions: [...ROLE_PERMISSIONS.super] };
const auth: AuthProvider = {
  kind: "local",
  status: "signedIn",
  user,
  getToken: async () => "acc",
  signOut: async () => {},
  hasPermission: makeHasPermission(user),
};
const device = (id: string, name: string, current = false) => ({
  id, name, branchId: "b1", lastSeenAt: 1_800_000_000_000, expiresAt: 1_900_000_000_000, createdAt: 1, current,
});

function mount() {
  const extras = {
    paired: true,
    branchId: "b1",
    client: createLocalClient({ baseUrl: "https://auth.test", fetchImpl: fetchMock as unknown as typeof fetch }),
  } as LocalAuthExtras;
  render(
    <AuthContext.Provider value={auth}>
      <LocalAuthContext.Provider value={extras}>
        <LocalDevicesAdmin />
      </LocalAuthContext.Provider>
    </AuthContext.Provider>,
  );
}

describe("dispositivos vinculados", () => {
  it("lista y revoca con confirmacion; el equipo actual no se puede revocar", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ devices: [device("d1", "Caja", true), device("d2", "iPad barra")] }));
    mount();
    expect(await screen.findByText("iPad barra")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("https://auth.test/v1/devices");
    expect(screen.getByText("Este equipo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revocar Caja" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Revocar iPad barra" }));
    expect(fetchMock).toHaveBeenCalledTimes(1); // aun no: pide confirmacion
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar revocar iPad barra" }));
    await waitFor(() => expect(screen.queryByText("iPad barra")).toBeNull());
    expect(fetchMock.mock.calls[1][0]).toBe("https://auth.test/v1/devices/d2");
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
    expect(screen.getByText("Caja")).toBeTruthy();
  });

  it("cancelar no revoca y un error del servicio muestra un mensaje generico", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ devices: [device("d2", "iPad barra")] }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Revocar iPad barra" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Revocar iPad barra" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Revocar iPad barra" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "interno" }, 500));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar revocar iPad barra" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No se pudo completar la acción. Intenta de nuevo.");
    expect(screen.getByText("iPad barra")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../lib/demoMode", () => ({
  isDemoMode: () => false,
  demoStatus: { active: false, error: null },
}));

import TopBar from "./TopBar";
import { SessionContext, type SessionValue } from "./session/context";
import {
  AuthContext,
  ROLE_PERMISSIONS,
  makeHasPermission,
  type AuthProvider,
} from "../lib/auth";

afterEach(cleanup);

function renderBar(signOut: () => Promise<void>) {
  const user = {
    id: "u",
    name: "Ana",
    role: "mesero" as const,
    permissions: [...ROLE_PERMISSIONS.mesero],
  };
  const auth: AuthProvider = {
    kind: "local",
    status: "signedIn",
    user,
    getToken: async () => "t",
    signOut,
    hasPermission: makeHasPermission(user),
  };
  const session = {
    waiterSession: null,
    requireWaiterLogin: () => {},
    masterDeviceId: null,
    deviceId: "d",
    connectedDevices: [],
  } as unknown as SessionValue;
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <SessionContext.Provider value={session}>
          <TopBar onRefresh={() => {}} refreshing={false} />
        </SessionContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe("usuario en la barra", () => {
  it("el botón muestra solo el nombre", () => {
    renderBar(async () => {});
    expect(screen.getByRole("button", { name: /Ana/ }).textContent).toBe("Ana");
  });

  it("tocarlo pregunta antes de salir; Regresar no cierra la sesión", () => {
    const signOut = vi.fn(async () => {});
    renderBar(signOut);
    fireEvent.click(screen.getByRole("button", { name: /Ana/ }));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText("¿Deseas salir de la sesión?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Regresar" }));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Deseas salir de la sesión?")).toBeNull();
  });

  it("Salir cierra la sesión", () => {
    const signOut = vi.fn(async () => {});
    renderBar(signOut);
    fireEvent.click(screen.getByRole("button", { name: /Ana/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

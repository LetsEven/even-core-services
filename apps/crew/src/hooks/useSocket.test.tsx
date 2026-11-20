// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

const open = vi.hoisted(() =>
  vi.fn(() => ({
    socket: { on: vi.fn(), emit: vi.fn() },
    stop: vi.fn(),
  })),
);
vi.mock("./crewSocket", () => ({ openCrewSocket: open }));
vi.mock("../lib/demoMode", () => ({ isDemoMode: () => false }));
vi.mock("../lib/platform", () => ({ isTauri: () => false }));

import { AuthContext, type AuthProvider } from "../lib/auth";
import { LocalAuthContext, type LocalAuthExtras } from "../lib/auth/localContext";
import { useSocket } from "./useSocket";

const props = {
  deviceId: "d1",
  onOrderClosed: vi.fn(),
  onDishStatusChanged: vi.fn(),
  onRefetch: vi.fn(),
};
const auth = (
  kind: "clerk" | "local",
  status: AuthProvider["status"] = "signedIn",
): AuthProvider => ({
  kind,
  status,
  user: null,
  getToken: async () => "t",
  signOut: async () => {},
  hasPermission: () => false,
});

describe("useSocket", () => {
  it("con provider local usa el branchId del dispositivo", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={auth("local")}>
        <LocalAuthContext.Provider value={{ branchId: "dev-branch" } as unknown as LocalAuthExtras}>
          {children}
        </LocalAuthContext.Provider>
      </AuthContext.Provider>
    );
    renderHook(() => useSocket({ ...props, branchId: "otra" }), { wrapper });
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: "dev-branch", kind: "local" }),
    );
  });

  it("con clerk usa el branchId seleccionado", () => {
    open.mockClear();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={auth("clerk")}>{children}</AuthContext.Provider>
    );
    renderHook(() => useSocket({ ...props, branchId: "sel" }), { wrapper });
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: "sel", kind: "clerk" }),
    );
  });

  it("no conecta sin sesion y conecta al pasar a signedIn", () => {
    open.mockClear();
    let status: AuthProvider["status"] = "signedOut";
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={auth("clerk", status)}>
        {children}
      </AuthContext.Provider>
    );
    const { rerender } = renderHook(
      () => useSocket({ ...props, branchId: "sel" }),
      { wrapper },
    );
    expect(open).not.toHaveBeenCalled();
    status = "signedIn";
    rerender();
    expect(open).toHaveBeenCalledTimes(1);
  });
});

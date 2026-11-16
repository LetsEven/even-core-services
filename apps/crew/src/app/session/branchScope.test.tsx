// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { Branch } from "../../services/api";

vi.mock("../../lib/demoMode", () => ({ isDemoMode: () => false, demoStatus: { active: false, error: null } }));
const api = vi.hoisted(() => ({ branches: [] as unknown[] }));
vi.mock("../../services/api", () => ({
  getBranches: async () => api.branches,
  getWaiters: async () => [{ id: "EVEN", name: "EVEN" }],
}));
vi.mock("../../hooks/useSocket", () => ({ useSocket: () => ({ setMaster: () => {} }) }));
vi.mock("../../hooks/usePrinting", () => ({
  usePrinting: () => ({ printJob: async () => true, setMasterDeviceId: () => {}, refreshPrinters: () => {} }),
}));
vi.mock("../../hooks/useKitchenOrders", () => ({
  useKitchenOrders: () => ({
    orders: [], loading: false, error: null, fetchOrders: async () => [], updateDish: () => {},
    updateDishQuantity: () => {}, updateOrderCookingStatus: () => {}, updatePrepTimeExtraMinutes: () => {},
    removeOrder: () => {}, updateDishFromSocket: () => {},
  }),
}));
vi.mock("../../hooks/useWakeLock", () => ({ useWakeLock: () => {} }));
vi.mock("../../hooks/useAudioUnlock", () => ({ useAudioUnlock: () => {} }));
vi.mock("../../hooks/useClearAppBadge", () => ({ useClearAppBadge: () => {} }));
vi.mock("../../lib/webPush", () => ({ syncWebPushToken: async () => {} }));
vi.mock("../../components/NewOrderToasts", () => ({ default: () => null }));
vi.mock("../../components/WaiterLoginModal", () => ({ default: () => null }));

import SessionProvider from "./SessionProvider";
import { useSession, type SessionValue } from "./context";
import { pickLocalBranch, scopeBranches } from "./branchScope";
import { AuthContext, ROLE_PERMISSIONS, makeHasPermission, type Role } from "../../lib/auth";
import { LocalAuthContext, type LocalAuthExtras } from "../../lib/auth/localContext";

const br = (id: string, restaurant_id: number): Branch => ({ id, name: id, branch_number: 1, restaurant_id });
const LIST = [br("b1", 1), br("b2", 1), br("b3", 2)];

beforeEach(() => {
  localStorage.clear();
  api.branches = LIST;
});
afterEach(cleanup);

describe("alcance de sucursal (funciones)", () => {
  it("no-super: solo la del dispositivo; super: las de su restaurante; sin dispositivo en la lista: ninguna", () => {
    expect(scopeBranches(LIST, "b1", false).map((b) => b.id)).toEqual(["b1"]);
    expect(scopeBranches(LIST, "b1", true).map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(scopeBranches(LIST, "zz", true)).toEqual([]);
    expect(pickLocalBranch(scopeBranches(LIST, "b1", true), "b1", "b3", "b2")).toBe("b2");
    expect(pickLocalBranch([], "b1", "b3")).toBe("b1");
  });
});

function mount(role: Role, deviceBranch = "b1") {
  const user = { id: "u", name: "U", role, permissions: [...ROLE_PERMISSIONS[role]] };
  const auth = {
    kind: "local" as const, status: "signedIn" as const, user,
    getToken: async () => "tok", signOut: async () => {}, hasPermission: makeHasPermission(user),
  };
  const ref: { s?: SessionValue } = {};
  function Probe() {
    ref.s = useSession();
    return null;
  }
  render(
    <AuthContext.Provider value={auth}>
      <LocalAuthContext.Provider value={{ paired: true, branchId: deviceBranch } as LocalAuthExtras}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </LocalAuthContext.Provider>
    </AuthContext.Provider>,
  );
  return ref;
}

describe("SessionProvider en modo local", () => {
  it("un mesero queda fijo en la sucursal del dispositivo, aunque el storage diga otra, y no puede cambiarla", async () => {
    localStorage.setItem("crew_branch_id", "b3");
    const ref = mount("mesero");
    await waitFor(() => expect(ref.s!.branches.map((b) => b.id)).toEqual(["b1"]));
    expect(ref.s!.branchId).toBe("b1");
    act(() => ref.s!.changeBranch("b2"));
    expect(ref.s!.branchId).toBe("b1");
    expect(localStorage.getItem("crew_branch_id")).toBe("b3"); // no se toca
  });

  it("el super ve y cambia solo entre sucursales de su restaurante", async () => {
    localStorage.setItem("crew_branch_id", "b3"); // de otro restaurante: se ignora
    const ref = mount("super");
    await waitFor(() => expect(ref.s!.branches.map((b) => b.id)).toEqual(["b1", "b2"]));
    expect(ref.s!.branchId).toBe("b1");
    act(() => ref.s!.changeBranch("b3"));
    expect(ref.s!.branchId).toBe("b1");
    act(() => ref.s!.changeBranch("b2"));
    expect(ref.s!.branchId).toBe("b2");
  });

  it("si la lista falla o no incluye la sucursal del dispositivo, se queda en la del dispositivo sin selector", async () => {
    api.branches = [br("x", 9)];
    const ref = mount("super");
    await waitFor(() => expect(ref.s!.branchesLoading).toBe(false));
    expect(ref.s!.branches).toEqual([]);
    expect(ref.s!.branchId).toBe("b1");
  });
});

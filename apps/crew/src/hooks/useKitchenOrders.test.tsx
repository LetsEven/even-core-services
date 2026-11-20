// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({
  getActiveOrders: vi.fn(),
  updateDishStatus: vi.fn(),
  updateFlexBillDishQuantity: vi.fn(),
  updatePickAndGoOrderCookingStatus: vi.fn(),
  updatePrepTimeExtra: vi.fn(),
}));
vi.mock("../services/api", () => api);

import { AuthContext, type AuthProvider } from "../lib/auth";
import { useKitchenOrders } from "./useKitchenOrders";

function makeAuth(getToken: AuthProvider["getToken"]): AuthProvider {
  return {
    kind: "local",
    status: "signedIn",
    user: null,
    getToken,
    signOut: async () => {},
    hasPermission: () => false,
  };
}

const order = { id: "o1", dishes: [], orderType: "flex_bill" };

describe("useKitchenOrders", () => {
  beforeEach(() => {
    api.getActiveOrders.mockReset();
    api.getActiveOrders.mockResolvedValue([order]);
  });

  it("no pide ordenes mientras enabled=false y las pide al activarse", async () => {
    // Misma referencia de getToken y mismo branchId: solo cambia enabled
    const getToken = vi.fn(async () => "t");
    const value = makeAuth(getToken);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
    const { result, rerender } = renderHook(
      ({ enabled }) => useKitchenOrders("b1", enabled),
      { wrapper, initialProps: { enabled: false } },
    );
    await Promise.resolve();
    expect(api.getActiveOrders).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.orders).toEqual([]);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    expect(api.getActiveOrders).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it("sin token no marca loading=false con lista vacia", async () => {
    const getToken = vi.fn(async () => null);
    const value = makeAuth(getToken);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
    const { result } = renderHook(() => useKitchenOrders("b1", true), {
      wrapper,
    });
    await waitFor(() => expect(getToken).toHaveBeenCalled());
    await Promise.resolve();
    expect(api.getActiveOrders).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.orders).toEqual([]);
  });
});

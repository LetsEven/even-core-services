// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UserDiscount } from "../userDiscounts";
import { createUseAccountDiscount } from "./useAccountDiscount";
import { createUseClaimedOrderDiscount } from "./useClaimedOrderDiscount";
import {
  conCarrito,
  createUsePersonalItemDiscounts,
} from "./usePersonalItemDiscounts";

const discount = (over: Partial<UserDiscount>): UserDiscount => ({
  id: "d1",
  restaurant_id: 1,
  service: null,
  discount_type: "order",
  menu_item_id: null,
  discount_percentage: 10,
  starts_at: "",
  ends_at: null,
  status: "claimed",
  claimed_at: null,
  menu_items: null,
  ...over,
});

const auth =
  (over = {}) =>
  () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "u1" },
    ...over,
  });

const userDiscountsService = (data: UserDiscount[]) => ({
  getActive: vi.fn().mockResolvedValue({ success: true, data }),
});

describe("useClaimedOrderDiscount", () => {
  it("devuelve el descuento de cuenta reclamado", async () => {
    const service = userDiscountsService([
      discount({ id: "item", discount_type: "item" }),
      discount({ id: "ord" }),
    ]);
    const useHook = createUseClaimedOrderDiscount({
      userDiscountsService: service,
      useAuth: auth(),
    });
    const { result } = renderHook(() => useHook(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.discount?.id).toBe("ord");
    expect(service.getActive).toHaveBeenCalledWith(1);
  });

  it("sin sesión no pide nada y no queda cargando", () => {
    const service = userDiscountsService([]);
    const useHook = createUseClaimedOrderDiscount({
      userDiscountsService: service,
      useAuth: auth({ isAuthenticated: false }),
    });
    const { result } = renderHook(() => useHook(1));
    expect(result.current).toEqual({ discount: null, loading: false });
    expect(service.getActive).not.toHaveBeenCalled();
  });

  it("queda cargando mientras la sesión se resuelve", () => {
    const useHook = createUseClaimedOrderDiscount({
      userDiscountsService: userDiscountsService([]),
      useAuth: auth({ isAuthenticated: false, isLoading: true }),
    });
    const { result } = renderHook(() => useHook(1));
    expect(result.current.loading).toBe(true);
  });
});

describe("useAccountDiscount", () => {
  const promoService = (data: unknown) => ({
    getClaimedOrderDiscount: vi.fn().mockResolvedValue({ success: true, data }),
  });
  const claimed =
    (discount: UserDiscount | null, loading = false) =>
    () => ({
      discount,
      loading,
    });

  it("prioriza el descuento personal sobre la promo", () => {
    const useHook = createUseAccountDiscount({
      promoActivationsService: promoService({
        redemptionId: "r1",
        batchId: "b",
        discountPercentage: 5,
      }),
      useClaimedOrderDiscount: claimed(
        discount({ id: "p1", discount_percentage: 20 }),
      ),
    });
    const { result } = renderHook(() => useHook(1, 2));
    expect(result.current).toEqual({
      accountDiscount: { source: "personal", id: "p1", discountPercentage: 20 },
      loading: false,
    });
  });

  it("usa la promo de cuenta cuando no hay personal", async () => {
    const service = promoService({
      redemptionId: "r1",
      batchId: "b",
      discountPercentage: 5,
    });
    const useHook = createUseAccountDiscount({
      promoActivationsService: service,
      useClaimedOrderDiscount: claimed(null),
    });
    const { result } = renderHook(() => useHook(1, 2));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accountDiscount).toEqual({
      source: "promo",
      id: "r1",
      discountPercentage: 5,
    });
    expect(service.getClaimedOrderDiscount).toHaveBeenCalledWith(1, 2);
  });

  it("sin sucursal no consulta la promo", () => {
    const service = promoService(null);
    const useHook = createUseAccountDiscount({
      promoActivationsService: service,
      useClaimedOrderDiscount: claimed(null),
    });
    const { result } = renderHook(() => useHook(1, null));
    expect(result.current).toEqual({ accountDiscount: null, loading: false });
    expect(service.getClaimedOrderDiscount).not.toHaveBeenCalled();
  });
});

describe("usePersonalItemDiscounts", () => {
  it("arma el mapa por platillo, se queda con el mayor % y comparte una sola petición", async () => {
    const service = userDiscountsService([
      discount({
        id: "a",
        discount_type: "item",
        menu_item_id: 5,
        discount_percentage: 10,
        status: "assigned",
      }),
      discount({
        id: "b",
        discount_type: "item",
        menu_item_id: 5,
        discount_percentage: 25,
      }),
      discount({
        id: "c",
        discount_type: "item",
        menu_item_id: 6,
        status: "assigned",
      }),
      discount({ id: "x", discount_type: "order" }),
    ]);
    const { usePersonalItemDiscounts: useHook } = createUsePersonalItemDiscounts({
      userDiscountsService: service,
      useAuth: auth(),
    });
    const first = renderHook(() => useHook(1));
    const second = renderHook(() => useHook(1));
    await waitFor(() => expect(first.result.current.size).toBe(2));
    await waitFor(() => expect(second.result.current.size).toBe(2));
    expect(first.result.current.get(5)).toEqual({
      id: "b",
      percentage: 25,
      piezas: null,
    });
    expect(service.getActive).toHaveBeenCalledTimes(1);
  });

  it("sin sesión devuelve un mapa vacío", () => {
    const service = userDiscountsService([]);
    const { usePersonalItemDiscounts: useHook } = createUsePersonalItemDiscounts({
      userDiscountsService: service,
      useAuth: auth({ isAuthenticated: false }),
    });
    const { result } = renderHook(() => useHook(1));
    expect(result.current.size).toBe(0);
    expect(service.getActive).not.toHaveBeenCalled();
  });

  it("un usuario distinto no reutiliza el cache del anterior", async () => {
    const service = userDiscountsService([
      discount({ discount_type: "item", menu_item_id: 5, status: "assigned" }),
    ]);
    let uid = "u1";
    const { usePersonalItemDiscounts: useHook } = createUsePersonalItemDiscounts({
      userDiscountsService: service,
      useAuth: () => ({
        isAuthenticated: true,
        isLoading: false,
        user: { id: uid },
      }),
    });
    const a = renderHook(() => useHook(1));
    await waitFor(() => expect(a.result.current.size).toBe(1));
    uid = "u2";
    const b = renderHook(() => useHook(1));
    await waitFor(() => expect(b.result.current.size).toBe(1));
    expect(service.getActive).toHaveBeenCalledTimes(2);
  });

  it("invalidate vuelve a pedir los descuentos", async () => {
    const service = userDiscountsService([
      discount({ discount_type: "item", menu_item_id: 5, status: "assigned" }),
    ]);
    const { usePersonalItemDiscounts: useHook, invalidate } =
      createUsePersonalItemDiscounts({
        userDiscountsService: service,
        useAuth: auth(),
      });
    const { result } = renderHook(() => useHook(1));
    await waitFor(() => expect(result.current.size).toBe(1));
    act(() => invalidate());
    await waitFor(() => expect(service.getActive).toHaveBeenCalledTimes(2));
  });

  it("omite los descuentos sin usos libres", async () => {
    const service = userDiscountsService([
      discount({
        discount_type: "item",
        menu_item_id: 5,
        status: "assigned",
        usos_libres: 0,
        piezas_restantes: 0,
      }),
    ]);
    const { usePersonalItemDiscounts: useHook } =
      createUsePersonalItemDiscounts({
        userDiscountsService: service,
        useAuth: auth(),
      });
    const { result } = renderHook(() => useHook(1));
    await waitFor(() => expect(service.getActive).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});

describe("conCarrito", () => {
  const base = { id: "d1", percentage: 20, piezas: 3, usos: 3 };

  it("resta las piezas del carrito local", () => {
    expect(
      conCarrito(base, [
        { userDiscountId: "d1", quantity: 2 },
        { userDiscountId: null, quantity: 5 },
      ]),
    ).toEqual({ ...base, piezas: 1 });
  });

  it("quita la oferta cuando el carrito agota los usos", () => {
    expect(conCarrito(base, [{ userDiscountId: "d1", quantity: 3 }])).toBe(
      undefined,
    );
  });

  it("ilimitado y backend sin usos_libres quedan igual", () => {
    expect(conCarrito({ ...base, usos: null }, [])).toEqual({
      ...base,
      usos: null,
      piezas: null,
    });
    const sinUsos = { id: "d1", percentage: 20, piezas: 2 };
    expect(conCarrito(sinUsos, [{ userDiscountId: "d1", quantity: 9 }])).toBe(
      sinUsos,
    );
  });
});

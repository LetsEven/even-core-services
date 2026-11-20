import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useServiceNavigation } from "./useServiceNavigation";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
let search = "table=12";
let routeParams: Record<string, string> = { restaurantId: "4", branchNumber: "1" };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(search),
  useParams: () => routeParams,
}));

describe("useServiceNavigation", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.values(router).forEach((fn) => fn.mockClear());
    search = "table=12";
    routeParams = { restaurantId: "4", branchNumber: "1" };
  });

  it("arma /{restaurantId}/{branchNumber}/{path}?table=… y respeta replace", () => {
    const { result } = renderHook(() => useServiceNavigation({ param: "table" }));
    result.current.navigateWithLocation("/cart");
    expect(router.push).toHaveBeenCalledWith("/4/1/cart?table=12");
    result.current.navigateWithLocation("order-confirm?x=1", true);
    expect(router.replace).toHaveBeenCalledWith("/4/1/order-confirm?x=1&table=12");
  });

  it("no duplica el prefijo si el path ya lo trae", () => {
    const { result } = renderHook(() => useServiceNavigation({ param: "table" }));
    expect(result.current.getUrlWithLocation("/4/1/menu")).toBe("/4/1/menu?table=12");
  });

  it("usa el parámetro room y el contexto cuando la ruta no trae ids", () => {
    search = "room=40";
    routeParams = {};
    const { result } = renderHook(() =>
      useServiceNavigation({ param: "room", restaurantId: 9, branchNumber: 2 }),
    );
    result.current.navigateWithLocation("/menu");
    expect(router.push).toHaveBeenCalledWith("/9/2/menu?room=40");
  });

  it("sin lugar navega sin contexto y goBack vuelve atrás", () => {
    search = "";
    const { result } = renderHook(() => useServiceNavigation({ param: "table" }));
    result.current.navigateWithLocation("/menu");
    expect(router.push).toHaveBeenCalledWith("/menu");
    result.current.goBack();
    expect(router.back).toHaveBeenCalled();
  });
});

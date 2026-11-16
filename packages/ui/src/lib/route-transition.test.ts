import { afterEach, describe, expect, it, vi } from "vitest";
import { flowStepOf, startRouteTransition } from "./route-transition";

const STEPS = ["cart", "order-confirm", "card-selection"];

describe("flowStepOf", () => {
  it("encuentra el paso con y sin sucursal en la ruta", () => {
    expect(flowStepOf("/29/cart?branch=1", STEPS)).toBe("cart");
    expect(flowStepOf("/29/7/order-confirm?table=3", STEPS)).toBe("order-confirm");
  });

  it("devuelve null fuera del flujo", () => {
    expect(flowStepOf("/29/7/menu", STEPS)).toBeNull();
  });
});

describe("startRouteTransition", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("navega sin animación cuando la ruta actual no es un paso del flujo", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    window.history.pushState({}, "", "/29/7/menu");
    const navigate = vi.fn();
    startRouteTransition("/29/7/cart", navigate, STEPS);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("navega sin animación con movimiento reducido", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    window.history.pushState({}, "", "/29/7/cart");
    const navigate = vi.fn();
    startRouteTransition("/29/7/order-confirm", navigate, STEPS);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

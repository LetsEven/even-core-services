import { describe, expect, it } from "vitest";
import { hasUnpaidDishes, resolveMenuIndicator } from "./menu-indicator";

describe("resolveMenuIndicator", () => {
  it("sin carrito ni cuenta: normal", () => {
    expect(resolveMenuIndicator({})).toBe("none");
    expect(resolveMenuIndicator({ cartCount: 0, hasPendingBill: false })).toBe("none");
  });

  it("solo cuenta pendiente: indicador de cuenta", () => {
    expect(resolveMenuIndicator({ cartCount: 0, hasPendingBill: true })).toBe("bill");
    expect(resolveMenuIndicator({ hasPendingBill: true })).toBe("bill");
  });

  it("solo carrito: indicador de carrito", () => {
    expect(resolveMenuIndicator({ cartCount: 2 })).toBe("cart");
  });

  it("cuenta y carrito: el carrito gana", () => {
    expect(resolveMenuIndicator({ cartCount: 1, hasPendingBill: true })).toBe("cart");
  });
});

describe("hasUnpaidDishes", () => {
  it("detecta platillos sin pagar e ignora los pagados", () => {
    expect(hasUnpaidDishes([{ payment_status: "paid" }, { payment_status: "not_paid" }])).toBe(true);
    expect(hasUnpaidDishes([{ payment_status: "paid" }])).toBe(false);
  });

  it("sin platillos o sin datos no hay cuenta", () => {
    expect(hasUnpaidDishes([])).toBe(false);
    expect(hasUnpaidDishes(null)).toBe(false);
    expect(hasUnpaidDishes(undefined)).toBe(false);
  });
});

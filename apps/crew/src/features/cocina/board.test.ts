import { describe, expect, it } from "vitest";
import type { Dish, Order } from "../../types";
import { formatElapsed, getOrderColumn, isOrderLate } from "./board";

const dish = (status: Dish["status"]): Dish => ({
  id: Math.random().toString(),
  item: "x",
  quantity: 1,
  status,
  images: [],
});

const order = (over: Partial<Order>): Order => ({
  id: "1",
  orderType: "tap",
  identifier: "Mesa 1",
  createdAt: new Date(0).toISOString(),
  dishes: [dish("preparing")],
  ...over,
});

describe("getOrderColumn", () => {
  it("deriva de los platillos", () => {
    expect(getOrderColumn(order({}))).toBe("preparing");
    expect(
      getOrderColumn(order({ dishes: [dish("ready"), dish("delivered")] })),
    ).toBe("ready");
    expect(
      getOrderColumn(order({ dishes: [dish("ready"), dish("preparing")] })),
    ).toBe("preparing");
    expect(getOrderColumn(order({ dishes: [dish("delivered")] }))).toBe(
      "delivered",
    );
  });
  it("Pick & Go usa el estado de cocina", () => {
    expect(
      getOrderColumn(order({ orderType: "pick_and_go", cookingStatus: "ready" })),
    ).toBe("ready");
  });
});

describe("isOrderLate", () => {
  it("compara contra prepTime + minutos extra", () => {
    const o = order({ prepTimeMinutes: 10, waiterExtraMinutes: 5 });
    expect(isOrderLate(o, 15 * 60_000)).toBe(false);
    expect(isOrderLate(o, 16 * 60_000)).toBe(true);
  });
  it("usa 20 min por defecto y solo en Preparando", () => {
    expect(isOrderLate(order({}), 21 * 60_000)).toBe(true);
    expect(
      isOrderLate(order({ dishes: [dish("ready")] }), 90 * 60_000),
    ).toBe(false);
  });
});

describe("formatElapsed", () => {
  it("formatea minutos y horas", () => {
    expect(formatElapsed(7)).toBe("7 min");
    expect(formatElapsed(65)).toBe("1 h 05");
  });
});

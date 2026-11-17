import { describe, expect, it } from "vitest";
import type { Dish, Order } from "../../types";
import {
  dishElapsedMinutes,
  formatElapsed,
  getDishColumn,
  getOrderProgress,
  groupDishTickets,
  isDishLate,
} from "./board";

let n = 0;
const dish = (status: Dish["status"], over: Partial<Dish> = {}): Dish => ({
  id: `d${n++}`,
  item: "x",
  quantity: 1,
  status,
  images: [],
  ...over,
});

const order = (over: Partial<Order>): Order => ({
  id: "1",
  orderType: "tap",
  identifier: "Mesa 1",
  createdAt: new Date(0).toISOString(),
  dishes: [dish("preparing")],
  ...over,
});

describe("getDishColumn", () => {
  it("cada platillo cae por su propio estado; entregado no se muestra", () => {
    expect(getDishColumn(dish("preparing"))).toBe("preparing");
    expect(getDishColumn(dish("ready"))).toBe("ready");
    expect(getDishColumn(dish("delivered"))).toBeNull();
  });
});

describe("groupDishTickets", () => {
  it("separa los platillos de un mismo pedido en ambas columnas", () => {
    const o = order({
      dishes: [dish("ready"), dish("preparing"), dish("delivered")],
    });
    const g = groupDishTickets([o]);
    expect(g.preparing).toHaveLength(1);
    expect(g.ready).toHaveLength(1);
  });
  it("incluye Pick & Go por platillo y ordena por antigüedad", () => {
    const viejo = order({
      id: "a",
      orderType: "pick_and_go",
      createdAt: new Date(1000).toISOString(),
      dishes: [dish("preparing")],
    });
    const nuevo = order({
      id: "b",
      createdAt: new Date(5000).toISOString(),
      dishes: [dish("preparing")],
    });
    const g = groupDishTickets([nuevo, viejo]);
    expect(g.preparing.map((t) => t.order.id)).toEqual(["a", "b"]);
  });
});

describe("getOrderProgress", () => {
  it("parcial: 3 de 4 listos", () => {
    const p = getOrderProgress(
      order({
        dishes: [
          dish("ready"),
          dish("ready"),
          dish("ready"),
          dish("preparing"),
        ],
      }),
    );
    expect(p).toMatchObject({
      ready: 3,
      pending: 4,
      partial: true,
      complete: false,
    });
  });
  it("completo cuando nada sigue en cocina y hay algo por entregar", () => {
    expect(
      getOrderProgress(order({ dishes: [dish("ready"), dish("delivered")] }))
        .complete,
    ).toBe(true);
    expect(
      getOrderProgress(order({ dishes: [dish("delivered")] })).complete,
    ).toBe(false);
    expect(
      getOrderProgress(order({ dishes: [dish("preparing")] })).complete,
    ).toBe(false);
  });
  it("los entregados no cuentan como pendientes", () => {
    const p = getOrderProgress(
      order({
        dishes: [
          dish("delivered"),
          dish("delivered"),
          dish("ready"),
          dish("preparing"),
        ],
      }),
    );
    expect(p.pending).toBe(2);
  });
});

describe("isDishLate", () => {
  it("compara contra prepTime + minutos extra", () => {
    const d = dish("preparing");
    const o = order({
      prepTimeMinutes: 10,
      waiterExtraMinutes: 5,
      dishes: [d],
    });
    expect(isDishLate(o, d, 15 * 60_000)).toBe(false);
    expect(isDishLate(o, d, 16 * 60_000)).toBe(true);
  });
  it("usa 20 min por defecto y solo aplica a platillos en preparación", () => {
    const p = dish("preparing");
    const r = dish("ready");
    const o = order({ dishes: [p, r] });
    expect(isDishLate(o, p, 21 * 60_000)).toBe(true);
    expect(isDishLate(o, r, 90 * 60_000)).toBe(false);
  });
});

describe("tiempo por platillo", () => {
  it("un platillo agregado después cuenta desde su propia hora, no desde la cuenta", () => {
    const nuevo = dish("preparing", {
      createdAt: new Date(23 * 60_000).toISOString(),
    });
    const o = order({ dishes: [dish("delivered"), nuevo] });
    const now = 24 * 60_000;
    expect(dishElapsedMinutes(o, nuevo, now)).toBe(1);
    expect(isDishLate(o, nuevo, now)).toBe(false);
  });
  it("sin hora propia usa la de la cuenta", () => {
    const d = dish("preparing");
    const o = order({ dishes: [d] });
    expect(dishElapsedMinutes(o, d, 24 * 60_000)).toBe(24);
  });
});

describe("formatElapsed", () => {
  it("formatea minutos y horas", () => {
    expect(formatElapsed(7)).toBe("7 min");
    expect(formatElapsed(65)).toBe("1 h 05");
  });
});

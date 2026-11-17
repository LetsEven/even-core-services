import { describe, expect, it } from "vitest";
import type { Dish, Order } from "../../types";
import { getDishColumn, getOrderProgress, groupDishTickets } from "./board";

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

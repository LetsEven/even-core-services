import { describe, expect, it } from "vitest";
import type { Order } from "../../types";
import { findUnitOrder, getUnitService, getUnitState } from "./serviceMeta";

const o = (orderType: Order["orderType"], identifier: string) =>
  ({ orderType, identifier }) as Order;

describe("findUnitOrder", () => {
  const orders = [
    o("flex_bill", "Mesa 5"),
    o("room", "Habitación 5"),
    o("pick_and_go", "Mesa 5"),
  ];
  it("mesa 5 ignora habitación y Pick & Go", () => {
    expect(findUnitOrder(orders, "5", "table")?.orderType).toBe("flex_bill");
  });
  it("habitación 5 solo ve Room Service", () => {
    expect(findUnitOrder(orders, "5", "room")?.orderType).toBe("room");
  });
});

describe("getUnitState / getUnitService", () => {
  it("prioriza mantenimiento y cobro", () => {
    expect(getUnitState("maintenance", true, undefined, true)).toBe("maintenance");
    expect(getUnitState("available", true, undefined, true)).toBe("cobro");
    expect(getUnitState("available", false, undefined, false)).toBe("libre");
    expect(getUnitState("available", false, o("tap", "Mesa 1"), false)).toBe("ocupada");
  });
  it("el servicio sale de la orden o del cobro Tap & Pay", () => {
    expect(getUnitService(o("flex_bill", "Mesa 1"), false, "table")).toBe("flex_bill");
    expect(getUnitService(undefined, true, "table")).toBe("tap_pay");
    expect(getUnitService(undefined, false, "table")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { Order } from "../../types";
import type { Branch } from "../../services/api";
import {
  clampExtraMinutes,
  findOrderForUnit,
  getAccountPermissions,
  getAccountTotals,
  getWaiterState,
} from "./logic";

const order = (p: Partial<Order>): Order => ({
  id: "1",
  orderType: "flex_bill",
  identifier: "Mesa 5",
  createdAt: "2026-01-01T00:00:00Z",
  dishes: [],
  ...p,
});
const branch = { id: "b" } as Branch;
const waiters = [
  { id: "EVEN", name: "EVEN" },
  { id: "7", name: "Ana" },
];

describe("findOrderForUnit", () => {
  it("encuentra por código y prefiere no Pick & Go", () => {
    const a = order({ id: "a", orderType: "pick_and_go", identifier: "Mesa 5" });
    const b = order({ id: "b", identifier: "Mesa 5 - Juan" });
    expect(findOrderForUnit([a, b], "5")?.id).toBe("b");
    expect(findOrderForUnit([a, b], "6")).toBeUndefined();
  });
});

describe("getAccountTotals", () => {
  it("prefiere los montos display de Flex Bill", () => {
    const t = getAccountTotals(
      order({
        totalAmount: 100,
        paidAmount: 0,
        remainingAmount: 100,
        totalDisplayAmount: 105,
        remainingDisplayAmount: 105,
      }),
    );
    expect(t).toEqual({ total: 105, paid: 0, remaining: 105, hasAmounts: true });
  });
  it("sin montos", () => {
    expect(getAccountTotals(order({})).hasAmounts).toBe(false);
  });
});

describe("getWaiterState", () => {
  it("isMine compara ids como string", () => {
    expect(
      getWaiterState("Ana", "7", { id: "7", name: "Ana" }, waiters).isMine,
    ).toBe(true);
    expect(
      getWaiterState("Ana", "7", { id: 7 as unknown as string, name: "Ana" }, waiters)
        .isMine,
    ).toBe(true);
    expect(
      getWaiterState("Ana", "7", { id: "8", name: "Luis" }, waiters).isMine,
    ).toBe(false);
  });
  it("sin id compara por nombre; EVEN es libre", () => {
    expect(
      getWaiterState("Ana", null, { id: "7", name: "Ana" }, waiters).isMine,
    ).toBe(true);
    const s = getWaiterState("EVEN", null, null, waiters);
    expect(s.isEven).toBe(true);
    expect(s.isMine).toBe(false);
    expect(s.hasRealWaiters).toBe(true);
  });
});

describe("getAccountPermissions", () => {
  it("editar platillos exige flex_bill y (libre o mío)", () => {
    const o = order({ remainingAmount: 10 });
    const p = (isEven: boolean, isMine: boolean) =>
      getAccountPermissions(o, branch, { isEven, isMine });
    expect(p(true, false).canEditDishes).toBe(true);
    expect(p(false, false).canEditDishes).toBe(false);
    expect(p(false, true).canEditDishes).toBe(true);
    expect(
      getAccountPermissions(order({ status: "paid" }), branch, {
        isEven: true,
        isMine: false,
      }).canAddDish,
    ).toBe(false);
  });
  it("cobro, ticket y movimientos por servicio", () => {
    const tp = order({ orderType: "tap_pay", remainingAmount: 5 });
    const w = { isEven: true, isMine: false };
    const p = getAccountPermissions(tp, branch, w);
    expect(p.canRegisterPayment).toBe(true);
    expect(p.canPrintTicket).toBe(true);
    expect(p.hideStatusButtons).toBe(true);
    expect(p.canViewMovements).toBe(false);
    expect(getAccountPermissions(tp, null, w).canRegisterPayment).toBe(false);
  });
});

describe("clampExtraMinutes", () => {
  it("acota a 0..60", () => {
    expect(clampExtraMinutes(-3)).toBe(0);
    expect(clampExtraMinutes(99)).toBe(60);
    expect(clampExtraMinutes(NaN)).toBe(0);
    expect(clampExtraMinutes(12.7)).toBe(12);
  });
});

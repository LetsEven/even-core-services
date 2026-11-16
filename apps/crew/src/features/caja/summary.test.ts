import { describe, expect, it } from "vitest";
import type { Order, PaymentTransaction } from "../../types";
import {
  filterOrders,
  matchesQuery,
  paymentBucket,
  summarizeOrders,
} from "./summary";

const pay = (
  cardType: string,
  baseAmount: number,
  tipAmount = 0,
): PaymentTransaction => ({
  id: `${cardType}-${baseAmount}`,
  baseAmount,
  tipAmount,
  totalCharged: baseAmount + tipAmount,
  cardType,
  createdAt: "2026-11-15T12:00:00Z",
});

const order = (over: Partial<Order>): Order => ({
  id: "o1",
  orderType: "flex_bill",
  identifier: "Mesa 4",
  createdAt: "2026-11-15T12:00:00Z",
  dishes: [],
  ...over,
});

describe("paymentBucket", () => {
  it("clasifica efectivo, terminal y el resto como digital", () => {
    expect(paymentBucket("cash")).toBe("cash");
    expect(paymentBucket("terminal")).toBe("terminal");
    expect(paymentBucket("credit")).toBe("digital");
    expect(paymentBucket("digital_wallet")).toBe("digital");
    expect(paymentBucket(null)).toBe("digital");
  });
});

describe("summarizeOrders", () => {
  it("devuelve ceros sin órdenes", () => {
    expect(summarizeOrders([])).toEqual({
      sales: 0,
      tips: 0,
      byMethod: { cash: 0, terminal: 0, digital: 0 },
      orders: 0,
      payments: 0,
    });
  });

  it("suma ventas, propinas y total por método", () => {
    const s = summarizeOrders([
      order({ payments: [pay("cash", 100, 10), pay("terminal", 200, 20)] }),
      order({ id: "o2", payments: [pay("credit", 50, 5), pay("cash", 30)] }),
    ]);
    expect(s.sales).toBe(380);
    expect(s.tips).toBe(35);
    expect(s.byMethod).toEqual({ cash: 140, terminal: 220, digital: 55 });
    expect(s.payments).toBe(4);
    expect(s.orders).toBe(2);
    expect(s.byMethod.cash + s.byMethod.terminal + s.byMethod.digital).toBe(
      s.sales + s.tips,
    );
  });

  it("cuenta como digital las órdenes pagadas sin pagos registrados", () => {
    const s = summarizeOrders([
      order({ orderType: "pick_and_go", paidAmount: 150 }),
      order({ id: "o2", paidAmount: 0 }),
      order({ id: "o3", paidAmount: null }),
    ]);
    expect(s.sales).toBe(150);
    expect(s.tips).toBe(0);
    expect(s.byMethod.digital).toBe(150);
    expect(s.payments).toBe(1);
    expect(s.orders).toBe(3);
  });

  it("tolera montos no numéricos", () => {
    const bad = { ...pay("cash", 0), baseAmount: NaN, tipAmount: undefined };
    const s = summarizeOrders([
      order({ payments: [bad as unknown as PaymentTransaction] }),
    ]);
    expect(s.sales).toBe(0);
    expect(s.byMethod.cash).toBe(0);
  });
});

describe("filterOrders", () => {
  const orders = [
    order({ id: "a", identifier: "Mesa 4", folio: "0016" }),
    order({ id: "b", identifier: "Terraza 2", customerName: "José Pérez" }),
    order({ id: "c", identifier: "Mesa 9", folio: "OR0000045939" }),
  ];

  it("sin consulta devuelve todo", () => {
    expect(filterOrders(orders, "  ")).toHaveLength(3);
  });
  it("busca por mesa sin importar mayúsculas", () => {
    expect(filterOrders(orders, "mesa").map((o) => o.id)).toEqual(["a", "c"]);
  });
  it("busca por folio con o sin ceros", () => {
    expect(filterOrders(orders, "16").map((o) => o.id)).toEqual(["a"]);
    expect(filterOrders(orders, "0016").map((o) => o.id)).toEqual(["a"]);
  });
  it("busca por cliente ignorando acentos", () => {
    expect(filterOrders(orders, "jose perez").map((o) => o.id)).toEqual(["b"]);
  });
});

describe("matchesQuery", () => {
  it("coincide en cualquiera de los campos", () => {
    expect(matchesQuery("flex", "Flex Bill", null)).toBe(true);
    expect(matchesQuery("xyz", "Flex Bill", "Mesa 1")).toBe(false);
    expect(matchesQuery("", "x")).toBe(true);
  });
});

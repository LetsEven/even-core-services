// Tests de oro del commissionCalculator de FlexBill (Fase 4.0). Deben pasar
// igual antes y después de migrarlo a createServicePayments (Fase 4.1).
import { calculateCommissions as calculateCoreCommissions } from "@even/payments";
import { describe, expect, it } from "vitest";
import {
  COMMISSION_SERVICE,
  calculateCommissions,
  calculateFlexBillItemCommission,
  calculateFlexBillProportionalCommission,
  formatMXN,
  getCommissionRates,
  getDisplaySubtotal,
  getDisplaySubtotalForFraction,
  getItemCommissionRate,
  getItemDisplayPrice,
  resolveTipAmountForTargetDisplay,
} from "./commissionCalculator";

const INPUTS: Array<[number, number]> = [
  [0, 0],
  [100, 10],
  [85, 50],
  [33.33, 0],
  [360, 0],
  [360, 36],
  [1234.56, 123.45],
  [199.99, 29.9985],
  [10.5, 1.575],
  [0.01, 0],
];
const PRICES = [0, 0.01, 10, 40, 40.01, 99.99, 100, 180, 1234.56];
const ITEMS = [
  { price: 85, quantity: 1 },
  { price: 33.33, extraPrice: 4.5, quantity: 3 },
  { price: 10.01, quantity: 0 },
  { price: 199.99, extraPrice: 0, quantity: 2 },
];
const TIPS = [0, 10, 36.5, 1.575];
const FRACTIONS = [0, 0.25, 1 / 3, 0.5, 1];

describe("commissionCalculator de FlexBill", () => {
  it("fija el servicio flex-bill", () => {
    expect(COMMISSION_SERVICE).toBe("flex-bill");
  });

  it("tarifa: 4 % restaurante, el cliente no paga comisión", () => {
    expect(getCommissionRates(0)).toEqual({ evenTotal: 4, clientPays: 0, restaurantPays: 4 });
    expect(getCommissionRates(100000)).toEqual({ evenTotal: 4, clientPays: 0, restaurantPays: 4 });
    expect(getItemCommissionRate(50)).toEqual({ clientPays: 0, restaurantPays: 4 });
  });

  it("ejemplo de docs/comisiones.md: consumo $100 + propina $10", () => {
    const b = calculateCommissions(100, 10);
    expect(b.totalAmountCharged).toBe(110);
    expect(b.evenClientCharge).toBe(0);
    expect(b.evenRestaurantCharge).toBe(5.1);
    const item = calculateFlexBillItemCommission([{ price: 100, quantity: 1 }], 10);
    expect(item.totalAmountCharged).toBe(110);
    expect(item.evenRestaurantCharge).toBe(5.1);
  });

  it("regla 1: con 0 % cliente getItemDisplayPrice devuelve el precio real", () => {
    for (const price of PRICES) {
      expect(getItemDisplayPrice(price)).toBe(Math.round(price * 100) / 100);
    }
  });

  it("regla 4: base + propina = total cobrado con 0 % cliente (por ítem y por fracción)", () => {
    for (const tip of TIPS) {
      const b = calculateFlexBillItemCommission(ITEMS, tip);
      expect(b.totalAmountCharged).toBe(Math.round((b.baseAmount + tip + 0) * 100) / 100);
      for (const fraction of FRACTIONS) {
        const p = calculateFlexBillProportionalCommission(ITEMS, fraction, tip);
        expect(p.evenClientCharge).toBe(0);
      }
    }
  });

  it("getDisplaySubtotal / getDisplaySubtotalForFraction", () => {
    expect(getDisplaySubtotal(ITEMS)).toMatchSnapshot();
    expect(getDisplaySubtotal([])).toBe(0);
    expect(FRACTIONS.map((f) => getDisplaySubtotalForFraction(ITEMS, f))).toMatchSnapshot();
  });

  it("calculateFlexBillItemCommission y Proportional: breakdown completo", () => {
    expect(TIPS.map((tip) => calculateFlexBillItemCommission(ITEMS, tip))).toMatchSnapshot();
    expect(TIPS.map((tip) => calculateFlexBillItemCommission([], tip))).toMatchSnapshot();
    expect(
      FRACTIONS.flatMap((f) => TIPS.map((tip) => calculateFlexBillProportionalCommission(ITEMS, f, tip))),
    ).toMatchSnapshot();
  });

  it("resolveTipAmountForTargetDisplay con la tarifa de FB (0 %)", () => {
    const subtotal = getDisplaySubtotal(ITEMS);
    const compute = (tip: number) => calculateFlexBillItemCommission(ITEMS, tip);
    const targets = [0, -5, 8.5, 50, 12.345, 0.01];
    expect(targets.map((t) => resolveTipAmountForTargetDisplay(compute, subtotal, t))).toMatchSnapshot();
  });

  it("resolveTipAmountForTargetDisplay despeja la comisión con una tarifa 2/2 (rama con comisión de cliente)", () => {
    const compute = (tip: number) => calculateCoreCommissions(85, tip, "pick-and-go");
    const targets = [0, 8.7, 50, 12.345, 0.01];
    expect(targets.map((t) => resolveTipAmountForTargetDisplay(compute, 86.97, t))).toMatchSnapshot();
  });

  it("rejilla de oro del breakdown y formatMXN", () => {
    expect(INPUTS.map(([base, tip]) => calculateCommissions(base, tip))).toMatchSnapshot();
    expect(formatMXN(1234.567)).toBe("$1234.57 MXN");
  });
});

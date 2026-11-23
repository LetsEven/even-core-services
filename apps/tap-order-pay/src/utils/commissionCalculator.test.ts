// Tests de oro del commissionCalculator de Tap Order & Pay (Fase 4.0). Deben
// pasar igual antes y después de migrarlo a createServicePayments (Fase 4.1).
import { calculateCommissions as calculateCoreCommissions } from "@even/payments";
import { describe, expect, it } from "vitest";
import {
  COMMISSION_SERVICE,
  calculateCommissions,
  formatMXN,
  getCommissionRates,
  getDisplaySubtotal,
  getDisplayTip,
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

describe("commissionCalculator de Tap Order & Pay", () => {
  it("fija el servicio tap-order-and-pay", () => {
    expect(COMMISSION_SERVICE).toBe("tap-order-and-pay");
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
  });

  it("regla 1: con 0 % cliente getItemDisplayPrice devuelve el precio real", () => {
    for (const price of PRICES) {
      expect(getItemDisplayPrice(price)).toBe(Math.round(price * 100) / 100);
    }
    expect(getItemDisplayPrice(33.333)).toBe(33.33);
  });

  it("regla 4: Subtotal + Propina mostrados suman el Total", () => {
    for (const [base, tip] of INPUTS) {
      const total = calculateCommissions(base, tip).totalAmountCharged;
      const subtotal = getDisplaySubtotal([{ price: base, quantity: 1 }]);
      const displayTip = getDisplayTip(total, subtotal);
      expect(Math.round((subtotal + displayTip) * 100) / 100).toBe(total);
    }
  });

  it("getDisplaySubtotal redondea por ítem", () => {
    expect(getDisplaySubtotal(ITEMS)).toMatchSnapshot();
    expect(getDisplaySubtotal([])).toBe(0);
  });

  it("resolveTipAmountForTargetDisplay con la tarifa de TOP (0 %) devuelve el objetivo a centavos", () => {
    const subtotal = getDisplaySubtotal([{ price: 85, quantity: 1 }]);
    const compute = (tip: number) => calculateCommissions(85, tip);
    const targets = [0, -5, 8.5, 50, 12.345, 0.01];
    expect(targets.map((t) => resolveTipAmountForTargetDisplay(compute, subtotal, t))).toMatchSnapshot();
  });

  it("resolveTipAmountForTargetDisplay despeja la comisión con una tarifa 2/2 (rama con comisión de cliente)", () => {
    const subtotal = 86.97;
    const compute = (tip: number) => calculateCoreCommissions(85, tip, "pick-and-go");
    const targets = [0, 8.7, 50, 12.345, 0.01];
    expect(targets.map((t) => resolveTipAmountForTargetDisplay(compute, subtotal, t))).toMatchSnapshot();
    // Sin base el factor es 1 y la corrección de redondeo es la que fija el resultado.
    expect(
      resolveTipAmountForTargetDisplay((tip) => calculateCoreCommissions(0, tip, "pick-and-go"), 0, 10),
    ).toMatchSnapshot();
  });

  it("getDisplayTip redondea a centavos", () => {
    expect(getDisplayTip(136.97, 86.97)).toBe(50);
    expect(getDisplayTip(10.005, 0)).toBe(Math.round(10.005 * 100) / 100);
  });

  it("rejilla de oro del breakdown y formatMXN", () => {
    expect(INPUTS.map(([base, tip]) => calculateCommissions(base, tip))).toMatchSnapshot();
    expect(formatMXN(1234.567)).toBe("$1234.57 MXN");
  });
});

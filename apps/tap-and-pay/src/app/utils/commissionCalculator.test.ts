// Tests de oro del commissionCalculator de Tap & Pay (Fase 4.0). Deben pasar
// igual antes y después de migrarlo a createServicePayments (Fase 4.1).
import { describe, expect, it } from "vitest";
import {
  COMMISSION_SERVICE,
  calculateCommissions,
  formatMXN,
  getCommissionRates,
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

describe("commissionCalculator de Tap & Pay", () => {
  it("fija el servicio tap-and-pay", () => {
    expect(COMMISSION_SERVICE).toBe("tap-and-pay");
  });

  it("tarifa: 4 % restaurante, el cliente no paga comisión", () => {
    expect(getCommissionRates(0)).toEqual({ evenTotal: 4, clientPays: 0, restaurantPays: 4 });
    expect(getCommissionRates(100000)).toEqual({ evenTotal: 4, clientPays: 0, restaurantPays: 4 });
  });

  it("ejemplo de docs/comisiones.md: consumo $100 + propina $10", () => {
    const b = calculateCommissions(100, 10);
    expect(b.totalAmountCharged).toBe(110);
    expect(b.evenClientCharge).toBe(0);
    expect(b.evenRestaurantCharge).toBe(5.1);
  });

  it("regla 4: con 0 % cliente el total es consumo + propina", () => {
    for (const [base, tip] of INPUTS) {
      expect(calculateCommissions(base, tip).totalAmountCharged).toBe(Math.round((base + tip) * 100) / 100);
    }
  });

  it("rejilla de oro del breakdown y formatMXN", () => {
    expect(INPUTS.map(([base, tip]) => calculateCommissions(base, tip))).toMatchSnapshot();
    expect(formatMXN(1234.567)).toBe("$1234.57 MXN");
  });
});

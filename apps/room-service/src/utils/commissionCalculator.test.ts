// Tests de oro del commissionCalculator de Room Service (Fase 4.0). Deben pasar igual
// antes y después de migrarlo a createServicePayments (Fase 4.1).
import { describe, expect, it } from "vitest";
import {
  COMMISSION_SERVICE,
  calculateCommissions,
  formatMXN,
  getCommissionRates,
  getItemCommissionRate,
  getItemDisplayPrice,
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

describe("commissionCalculator de Room Service", () => {
  it("fija el servicio room-service", () => {
    expect(COMMISSION_SERVICE).toBe("room-service");
  });

  it("tarifa: 2 % cliente + 2 % restaurante", () => {
    expect(getCommissionRates(0)).toEqual({ evenTotal: 4, clientPays: 2, restaurantPays: 2 });
    expect(getCommissionRates(100000)).toEqual({ evenTotal: 4, clientPays: 2, restaurantPays: 2 });
    expect(getItemCommissionRate(50)).toEqual({ clientPays: 2, restaurantPays: 2 });
  });

  it("ejemplo de docs/comisiones.md: consumo $100 + propina $10", () => {
    const b = calculateCommissions(100, 10);
    expect(b.totalAmountCharged).toBe(112.55);
    expect(b.evenRestaurantCharge).toBe(2.55);
  });

  it("regla 4: base + propina + comisión del cliente = total", () => {
    for (const [base, tip] of INPUTS) {
      const b = calculateCommissions(base, tip);
      expect(b.totalAmountCharged).toBe(Math.round((base + tip + b.evenClientCharge) * 100) / 100);
    }
  });

  it("getItemDisplayPrice: el cliente ve su 2 % + IVA incrustado", () => {
    for (const price of PRICES) {
      expect(getItemDisplayPrice(price)).toMatchSnapshot(`precio ${price}`);
    }
  });

  it("rejilla de oro del breakdown y formatMXN", () => {
    expect(INPUTS.map(([base, tip]) => calculateCommissions(base, tip))).toMatchSnapshot();
    expect(formatMXN(1234.567)).toBe("$1234.57 MXN");
  });
});

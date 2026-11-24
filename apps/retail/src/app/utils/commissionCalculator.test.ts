import { describe, expect, it } from "vitest";
import {
  COMMISSION_SERVICE,
  calculateCommissions,
  getCommissionRates,
} from "./commissionCalculator";

describe("commissionCalculator de Retail", () => {
  it("fija el servicio retail", () => {
    expect(COMMISSION_SERVICE).toBe("retail");
  });

  it("4 % restaurante, el cliente no paga comisión", () => {
    expect(getCommissionRates(100)).toEqual({ evenTotal: 4, clientPays: 0, restaurantPays: 4 });
  });

  it("sin propina, el cliente paga exactamente el total de la orden", () => {
    for (const total of [0.01, 33.33, 116, 1234.56]) {
      const b = calculateCommissions(total, 0);
      expect(b.totalAmountCharged).toBe(total);
      expect(b.evenClientCharge).toBe(0);
    }
  });
});

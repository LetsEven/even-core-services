import { describe, expect, it } from "vitest";
import { calculateCommissions } from "./commissions";
import { computeMsiTotal } from "./msi";
import { computeTipAmount, MINIMUM_AMOUNT, TIP_PRESETS } from "./tip";

// Valores de oro de la fórmula inline que usaban las 5 apps: total / (1 - rate/100 * 1.16).
const legacy = (total: number, rate: number) => total / (1 - (rate / 100) * 1.16);

describe("computeMsiTotal", () => {
  it("es idéntica a la fórmula inline de las apps, sin redondeo extra", () => {
    for (const total of [0, 0.01, 300, 396, 405.19, 1234.56, 99999.99]) {
      for (const rate of [0, 3.5, 6, 7.5, 12.9, 18]) {
        expect(computeMsiTotal(total, rate)).toBe(legacy(total, rate));
      }
    }
  });

  it("valores de oro", () => {
    expect(computeMsiTotal(396, 7.5).toFixed(2)).toBe("433.73");
    expect(computeMsiTotal(405.19, 7.5).toFixed(2)).toBe("443.80");
    expect(computeMsiTotal(500, 0)).toBe(500);
  });
});

describe("propina", () => {
  it("presets y mínimo", () => {
    expect([...TIP_PRESETS]).toEqual([0, 10, 15, 20]);
    expect(MINIMUM_AMOUNT).toBe(20);
  });

  it("no redondea la propina (igual que even-backend); solo el total final se redondea", () => {
    expect(computeTipAmount(33.5, 15)).toBe(5.025);
    expect(computeTipAmount(20.9, 15)).toBe(3.135);
    expect(computeTipAmount(100, 0)).toBe(0);
    for (const base of [10.5, 33.33, 199.99, 1234.56]) {
      for (const pct of TIP_PRESETS) {
        expect(computeTipAmount(base, pct)).toBe((base * pct) / 100);
      }
    }
  });

  it("el total enviado es siempre un monto de 2 decimales aunque la propina no lo sea", () => {
    // 0 % cliente (TOP/FB/TP): r2(20.9 + 3.135) = 24.03; con la propina a centavos (3.14) era 24.04.
    const zero = calculateCommissions(20.9, computeTipAmount(20.9, 15), "tap-order-and-pay");
    expect(zero.tipAmount).toBe(3.135);
    expect(zero.totalAmountCharged).toBe(24.03);
    // 2 % cliente (PG/RS): la comisión sale del subtotal sin redondear y solo el total se redondea.
    const two = calculateCommissions(20.9, computeTipAmount(20.9, 15), "pick-and-go");
    expect(two.totalAmountCharged).toBe(24.59);
    for (const base of [10.5, 20.9, 33.33, 199.99, 1234.56]) {
      for (const pct of TIP_PRESETS) {
        for (const service of ["pick-and-go", "tap-order-and-pay"] as const) {
          const { totalAmountCharged } = calculateCommissions(base, computeTipAmount(base, pct), service);
          expect(totalAmountCharged).toBe(Math.round(totalAmountCharged * 100) / 100);
        }
      }
    }
  });
});

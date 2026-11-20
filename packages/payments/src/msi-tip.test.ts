import { describe, expect, it } from "vitest";
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

  it('"none" no redondea (PG/RS/TP) y "cents" redondea a centavos (TOP/FB)', () => {
    expect(computeTipAmount(33.5, 15, "none")).toBe(5.025);
    expect(computeTipAmount(20.9, 15, "none")).toBe(3.135);
    expect(computeTipAmount(20.9, 15, "cents")).toBe(3.14);
    expect(computeTipAmount(100, 0, "cents")).toBe(0);
    for (const base of [10.5, 33.33, 199.99, 1234.56]) {
      for (const pct of TIP_PRESETS) {
        expect(computeTipAmount(base, pct, "none")).toBe((base * pct) / 100);
        expect(computeTipAmount(base, pct, "cents")).toBe(Math.round(((base * pct) / 100) * 100) / 100);
      }
    }
  });
});

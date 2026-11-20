import { describe, expect, it } from "vitest";
import { calculateCommissions, getCommissionRates, IVA_FACTOR, IVA_RATE, type CommissionService } from "./commissions";
import { createServicePayments } from "./service-payments";

const SERVICES: CommissionService[] = ["pick-and-go", "room-service", "tap-order-and-pay", "flex-bill", "tap-and-pay"];
const ITEMS = [
  { price: 85, quantity: 1 },
  { price: 33.33, extraPrice: 4.5, quantity: 3 },
  { price: 199.99, quantity: 2 },
];

describe("IVA", () => {
  it("IVA_RATE 16 % e IVA_FACTOR 1.16", () => {
    expect(IVA_RATE).toBe(0.16);
    expect(IVA_FACTOR).toBe(1.16);
  });
});

describe("createServicePayments", () => {
  it.each(SERVICES)("%s: delega tarifa y breakdown en commissions.ts", (service) => {
    const p = createServicePayments(service);
    expect(p.service).toBe(service);
    expect(p.getCommissionRates(123)).toEqual(getCommissionRates(123, service));
    expect(p.calculateCommissions(100, 10)).toEqual(calculateCommissions(100, 10, service));
    expect(p.getItemCommissionRate(5)).toEqual({
      clientPays: getCommissionRates(0, service).clientPays,
      restaurantPays: getCommissionRates(0, service).restaurantPays,
    });
  });

  it.each(["tap-order-and-pay", "flex-bill", "tap-and-pay"] as const)(
    "regla 1: %s con 0 %% cliente devuelve el precio real",
    (service) => {
      const p = createServicePayments(service);
      for (const price of [0, 0.01, 10, 99.99, 180, 1234.56]) expect(p.getItemDisplayPrice(price)).toBe(price);
      expect(p.getDisplaySubtotal(ITEMS)).toBe(
        Math.round(
          ITEMS.reduce((s, i) => s + Math.round((i.price + (("extraPrice" in i && i.extraPrice) || 0)) * i.quantity * 100) / 100, 0) * 100,
        ) / 100,
      );
    },
  );

  it.each(["pick-and-go", "room-service"] as const)("%s: el precio de display incluye 2 %% + IVA", (service) => {
    const p = createServicePayments(service);
    expect(p.getItemDisplayPrice(100)).toBe(102.32);
    expect(p.getItemDisplayPrice(180)).toBe(184.18);
  });

  it("regla 4: Subtotal + Propina mostrados suman el Total (2/2)", () => {
    const p = createServicePayments("pick-and-go");
    const base = 85;
    const subtotal = p.getDisplaySubtotal([{ price: base, quantity: 1 }]);
    const target = 50;
    const tip = p.resolveTipAmountForTargetDisplay((t) => p.calculateCommissions(base, t), subtotal, target);
    const total = p.calculateCommissions(base, tip).totalAmountCharged;
    expect(p.getDisplayTip(total, subtotal)).toBe(target);
    expect(tip).toBe(48.86);
  });

  it("la tasa de respaldo del restaurante sin ítems sale de la tabla del servicio", () => {
    const fb = createServicePayments("flex-bill").calculateItemCommission([], 10);
    expect(fb.rates.restaurantPays).toBe(4);
    expect(fb.evenRestaurantCharge).toBe(0.46);
    // Con otro servicio la tasa de respaldo es la suya (2 %), no una constante de 4 %.
    expect(createServicePayments("pick-and-go").calculateItemCommission([], 10).rates.restaurantPays).toBe(2);
  });
});

// Tests de oro de comisiones (Fase 4.0): congelan los números de cada servicio
// para que cualquier refactor (createServicePayments, MSI, propina, payloads)
// pruebe que no cambió un solo centavo. Ejemplos de docs/comisiones.md.
import { describe, expect, it } from "vitest";
import {
  calculateCommissions,
  getCommissionRates,
  SERVICE_COMMISSION_RATES,
  type CommissionService,
} from "./commissions";

const SERVICES: CommissionService[] = [
  "pick-and-go",
  "room-service",
  "tap-order-and-pay",
  "flex-bill",
  "tap-and-pay",
];

const CLIENT_PAYS = new Set<CommissionService>(["pick-and-go", "room-service"]);

// [consumo, propina]: ejemplo de la doc, redondeos de centavo y medios centavos.
const GOLDEN_INPUTS: Array<[number, number]> = [
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

describe("ejemplos de docs/comisiones.md (consumo $100 + propina $10)", () => {
  it.each(["pick-and-go", "room-service"] as const)(
    "%s: cliente $112.55 (comisión $2.20 + IVA $0.35), restaurante $2.55",
    (service) => {
      const b = calculateCommissions(100, 10, service);
      expect(b.totalAmountCharged).toBe(112.55);
      expect(b.evenClientCharge).toBe(2.55);
      expect(b.evenCommissionClient).toBeCloseTo(2.2, 10);
      expect(b.ivaEvenClient).toBeCloseTo(0.352, 10);
      expect(b.evenRestaurantCharge).toBe(2.55);
      expect(b.rates).toEqual({ evenTotal: 4, clientPays: 2, restaurantPays: 2 });
    },
  );

  it.each(["tap-order-and-pay", "flex-bill", "tap-and-pay"] as const)(
    "%s: cliente $110.00, restaurante $5.10 (4 % + IVA)",
    (service) => {
      const b = calculateCommissions(100, 10, service);
      expect(b.totalAmountCharged).toBe(110);
      expect(b.evenClientCharge).toBe(0);
      expect(b.evenRestaurantCharge).toBe(5.1);
      expect(b.rates).toEqual({ evenTotal: 4, clientPays: 0, restaurantPays: 4 });
    },
  );
});

describe("alias de servicio (mismos que even-backend)", () => {
  const ALIASES: Array<[string, CommissionService]> = [
    ["tap-order-pay", "tap-order-and-pay"],
    ["tap_order_and_pay", "tap-order-and-pay"],
    ["flexbill", "flex-bill"],
    ["flex_bill", "flex-bill"],
    ["tap-pay", "tap-and-pay"],
    ["tap_and_pay", "tap-and-pay"],
    ["tap_pay", "tap-and-pay"],
    [" Tap-Order-Pay ", "tap-order-and-pay"],
    ["FLEXBILL", "flex-bill"],
  ];

  it.each(ALIASES)("%s equivale a %s en tarifa y en breakdown", (alias, canonical) => {
    expect(getCommissionRates(100, alias)).toEqual(getCommissionRates(100, canonical));
    expect(calculateCommissions(123.45, 12.3, alias)).toEqual(calculateCommissions(123.45, 12.3, canonical));
  });

  it("sin servicio, vacío o desconocido usa 2/2 (también Pick & Go y Room Service con alias)", () => {
    const dividida = { evenTotal: 4, clientPays: 2, restaurantPays: 2 };
    for (const s of [undefined, null, "", "   ", "otro", "pick_and_go", "pickandgo"]) {
      expect(getCommissionRates(50, s)).toEqual(dividida);
    }
  });
});

describe("regla 4: subtotal + propina mostrados suman el total", () => {
  it.each(SERVICES)("%s: base + propina + comisión del cliente = total cobrado", (service) => {
    for (const [base, tip] of GOLDEN_INPUTS) {
      const b = calculateCommissions(base, tip, service);
      expect(b.totalAmountCharged).toBe(Math.round((base + tip + b.evenClientCharge) * 100) / 100);
      if (!CLIENT_PAYS.has(service)) {
        // 0 % cliente: el total es consumo + propina (redondeo solo al final).
        expect(b.evenClientCharge).toBe(0);
        expect(b.totalAmountCharged).toBe(Math.round((base + tip) * 100) / 100);
      }
    }
  });

  it("el redondeo es solo al final: la propina no se redondea antes de sumar", () => {
    // La propina viaja cruda (sin redondear a centavos) hasta el total final.
    expect(calculateCommissions(10.5, 1.575, "tap-and-pay").totalAmountCharged).toBe(12.08);
    expect(calculateCommissions(199.99, 29.9985, "flex-bill").totalAmountCharged).toBe(229.99);
    expect(calculateCommissions(0.01, 0.004, "tap-order-and-pay").totalAmountCharged).toBe(0.01);
  });
});

describe("la tabla de tarifas es la única fuente", () => {
  it("solo TOP, FB y TP están en SERVICE_COMMISSION_RATES (PG/RS usan el default 2/2)", () => {
    expect(Object.keys(SERVICE_COMMISSION_RATES).sort()).toEqual(["flex-bill", "tap-and-pay", "tap-order-and-pay"]);
  });
});

describe("rejilla de oro: breakdown completo por servicio", () => {
  it("congela cada campo del breakdown", () => {
    const grid = Object.fromEntries(
      SERVICES.map((service) => [service, GOLDEN_INPUTS.map(([base, tip]) => calculateCommissions(base, tip, service))]),
    );
    expect(grid).toMatchSnapshot();
  });
});

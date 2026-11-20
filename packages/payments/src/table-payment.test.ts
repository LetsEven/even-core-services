import { describe, expect, it } from "vitest";
import {
  equalShare,
  readTableChargeBlock,
  TABLE_PAYMENT_MINIMUM_AMOUNT,
  withoutHeldAmount,
} from "./table-payment";

describe("equalShare", () => {
  it("divide el total de la cuenta, no lo que falta", () => {
    expect(equalShare(300, 3, 200)).toBe(100);
  });

  it("nunca cobra más de lo que falta", () => {
    expect(equalShare(300, 2, 80)).toBe(80);
  });

  it("el último pago se lleva el residuo del redondeo", () => {
    // 100 / 3 = 33.33; tras dos pagos faltan 33.34
    expect(equalShare(100, 3, 100)).toBe(33.33);
    expect(equalShare(100, 3, 33.34)).toBe(33.34);
  });
});

describe("withoutHeldAmount", () => {
  it("descuenta lo apartado por otros sin bajar de cero", () => {
    expect(withoutHeldAmount(100, 30)).toBe(70);
    expect(withoutHeldAmount(20, 30)).toBe(0);
    expect(withoutHeldAmount(50, undefined)).toBe(50);
  });
});

describe("readTableChargeBlock", () => {
  it("reconoce order_changed en code, error.code o error.type", () => {
    expect(readTableChargeBlock({ code: "order_changed" })).toEqual({ kind: "order_changed" });
    expect(readTableChargeBlock({ error: { code: "order_changed" } })).toEqual({ kind: "order_changed" });
    expect(readTableChargeBlock({ error: { type: "order_changed" } })).toEqual({ kind: "order_changed" });
  });

  it("cuenta_apartada trae lo apartado por otros", () => {
    expect(
      readTableChargeBlock({
        code: "cuenta_apartada",
        error: { code: "cuenta_apartada", details: { apartado_por_otros: 42.5 } },
      }),
    ).toEqual({ kind: "cuenta_apartada", heldByOthers: 42.5 });
  });

  it("otros rechazos no bloquean", () => {
    expect(readTableChargeBlock({ code: "payment_rejected" })).toBeNull();
    expect(readTableChargeBlock(null)).toBeNull();
  });

  it("el mínimo de mesa es 15", () => {
    expect(TABLE_PAYMENT_MINIMUM_AMOUNT).toBe(15);
  });
});

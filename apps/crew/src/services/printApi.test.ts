import { describe, expect, it } from "vitest";
import { isReprintEnabled, reprintErrorMessage, reprintPath } from "./printApi";

describe("printApi", () => {
  it("flag", () => {
    expect(isReprintEnabled("true")).toBe(true);
    expect(isReprintEnabled("false")).toBe(false);
    expect(isReprintEnabled(undefined)).toBe(false);
  });
  it("ruta", () => {
    expect(reprintPath("flex_bill", "abc")).toBe(
      "/api/kitchen/orders/flex_bill/abc/reprint",
    );
  });
  it("mensajes amables", () => {
    expect(reprintErrorMessage(404)).toMatch(/aún no está disponible/);
    expect(reprintErrorMessage(500)).toMatch(/No se pudo/);
  });
});

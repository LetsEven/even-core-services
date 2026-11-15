import { describe, expect, it } from "vitest";
import { REPRINT_HEADER, buildTicket } from "./usePrinting";

const items = [{ name: "Taco", quantity: 2 }];
const text = (bytes: number[]) => String.fromCharCode(...bytes);

describe("buildTicket", () => {
  it("no lleva encabezado de reimpresión por defecto", async () => {
    const t = text(await buildTicket(items, "Mesa 5", 12));
    expect(t).not.toContain("REIMPRESI");
    expect(t).toContain("2 TACO");
  });

  it("agrega el encabezado de reimpresión antes de la mesa", async () => {
    const t = text(await buildTicket(items, "Mesa 5", 12, null, null, true));
    expect(t).toContain(REPRINT_HEADER);
    expect(t.indexOf(REPRINT_HEADER)).toBeLessThan(t.indexOf("MESA"));
  });
});

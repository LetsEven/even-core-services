import { describe, expect, it } from "vitest";
import { mergeMessages } from "./index";

describe("mergeMessages", () => {
  it("la app sobrescribe una clave compartida", () => {
    expect(mergeMessages({ Common: { ok: "Aceptar", no: "No" } }, { Common: { ok: "Listo" } })).toEqual({
      Common: { ok: "Listo", no: "No" },
    });
  });

  it("agrega namespaces propios de la app y conserva los compartidos", () => {
    expect(mergeMessages({ Common: { ok: "Aceptar" } }, { HomePage: { title: "Hola" } })).toEqual({
      Common: { ok: "Aceptar" },
      HomePage: { title: "Hola" },
    });
  });

  it("no modifica los objetos de entrada", () => {
    const shared = { Common: { ok: "Aceptar" } };
    const own = { Common: { no: "No" } };
    mergeMessages(shared, own);
    expect(shared).toEqual({ Common: { ok: "Aceptar" } });
    expect(own).toEqual({ Common: { no: "No" } });
  });
});

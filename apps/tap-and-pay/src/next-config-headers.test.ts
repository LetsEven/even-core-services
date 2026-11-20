import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// Prueba de caracterización: congela lo que `headers()` de next.config sirve
// (estáticos de la app) y la lista de paquetes transpilados.
describe("next.config", () => {
  it("headers()", async () => {
    expect(await nextConfig.headers?.()).toMatchSnapshot();
  });
});

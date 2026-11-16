import { describe, expect, it } from "vitest";
import { evaluateDemoMode } from "./demoMode";

describe("evaluateDemoMode", () => {
  it("nunca esta activo por defecto", () => {
    expect(evaluateDemoMode({})).toEqual({ active: false, error: null });
    expect(evaluateDemoMode({ VITE_DEMO_MODE: "" }).active).toBe(false);
    expect(evaluateDemoMode({ VITE_DEMO_MODE: "false" }).active).toBe(false);
    expect(evaluateDemoMode({ VITE_DEMO_MODE: "1" }).active).toBe(false);
  });

  it("se activa solo con VITE_DEMO_MODE=true y API de dev (o sin API)", () => {
    expect(evaluateDemoMode({ VITE_DEMO_MODE: "true" }).active).toBe(true);
    expect(
      evaluateDemoMode({
        VITE_DEMO_MODE: "true",
        VITE_API_BASE_URL: "https://even-backend-dev.up.railway.app",
      }),
    ).toEqual({ active: true, error: null });
  });

  it.each([
    "https://api.letseven.io",
    "https://API.LETSEVEN.IO/",
    "https://even-backend-production.up.railway.app",
  ])("se niega con API de produccion (%s)", (url) => {
    const r = evaluateDemoMode({
      VITE_DEMO_MODE: "true",
      VITE_API_BASE_URL: url,
    });
    expect(r.active).toBe(false);
    expect(r.error).toMatch(/MODO DEMO rechazado/);
  });

  it("sin VITE_DEMO_MODE no opina sobre la API de produccion", () => {
    expect(
      evaluateDemoMode({ VITE_API_BASE_URL: "https://api.letseven.io" }),
    ).toEqual({ active: false, error: null });
  });

  it("VITE_AUTH_PROVIDER=demo pide demo con las mismas salvaguardas", () => {
    expect(evaluateDemoMode({ VITE_AUTH_PROVIDER: "demo" })).toEqual({
      active: true,
      error: null,
    });
    expect(
      evaluateDemoMode({
        VITE_AUTH_PROVIDER: "demo",
        VITE_API_BASE_URL: "https://api.letseven.io",
      }).error,
    ).toMatch(/MODO DEMO rechazado/);
    expect(evaluateDemoMode({ VITE_AUTH_PROVIDER: "local" }).active).toBe(false);
  });
});

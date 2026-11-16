import { describe, expect, it } from "vitest";
import { resolveAuthProvider } from "./select";

describe("seleccion de provider por env", () => {
  it("default clerk", () => {
    expect(resolveAuthProvider({})).toBe("clerk");
    expect(resolveAuthProvider({ VITE_AUTH_PROVIDER: "" })).toBe("clerk");
  });
  it("clerk | local | demo explicitos (sin importar mayusculas)", () => {
    expect(resolveAuthProvider({ VITE_AUTH_PROVIDER: "clerk" })).toBe("clerk");
    expect(resolveAuthProvider({ VITE_AUTH_PROVIDER: "local" })).toBe("local");
    expect(resolveAuthProvider({ VITE_AUTH_PROVIDER: "LOCAL" })).toBe("local");
    expect(resolveAuthProvider({ VITE_AUTH_PROVIDER: "demo" })).toBe("demo");
  });
  it("VITE_DEMO_MODE=true sigue forzando demo, incluso sobre local", () => {
    expect(resolveAuthProvider({ VITE_DEMO_MODE: "true" })).toBe("demo");
    expect(
      resolveAuthProvider({ VITE_DEMO_MODE: "true", VITE_AUTH_PROVIDER: "local" }),
    ).toBe("demo");
  });
  it("demo con API de produccion no cae a otro provider (se rechaza en main)", () => {
    const env = {
      VITE_DEMO_MODE: "true",
      VITE_AUTH_PROVIDER: "local",
      VITE_API_BASE_URL: "https://api.letseven.io",
    };
    expect(resolveAuthProvider(env)).toBe("demo");
    expect(resolveAuthProvider({ ...env, VITE_DEMO_MODE: undefined, VITE_AUTH_PROVIDER: "demo" })).toBe("demo");
  });
  it("un valor desconocido es un error de configuracion", () => {
    expect(() => resolveAuthProvider({ VITE_AUTH_PROVIDER: "locla" })).toThrow(
      /VITE_AUTH_PROVIDER invalido/,
    );
  });
  it("VITE_CREW_AUTH_URL no cambia la seleccion", () => {
    expect(resolveAuthProvider({ VITE_CREW_AUTH_URL: "https://auth.example" })).toBe("clerk");
  });
});

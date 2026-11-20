import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

// Prueba de caracterización: congela los headers de seguridad (CSP incluida)
// que emite el middleware de la app (con la cookie de idioma ya puesta, para no
// depender de la fecha de expiración). Cualquier cambio en el snapshot es un
// cambio de comportamiento en producción y debe revisarse a conciencia.

const UUID = "00000000-0000-4000-8000-000000000000";

function headersFor(env: { NODE_ENV: string; NEXT_PUBLIC_API_URL?: string }) {
  vi.stubEnv("NODE_ENV", env.NODE_ENV);
  vi.stubEnv("NEXT_PUBLIC_API_URL", env.NEXT_PUBLIC_API_URL ?? "");
  vi.spyOn(crypto, "randomUUID").mockReturnValue(UUID);
  const response = middleware(new NextRequest("https://app.example.test/x", { headers: { cookie: "NEXT_LOCALE=es" } }));
  return [...response.headers.entries()].sort(([a], [b]) => a.localeCompare(b));
}

describe("security headers del middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("producción, backend por defecto", () => {
    expect(headersFor({ NODE_ENV: "production" })).toMatchSnapshot();
  });

  it("producción, backend configurado", () => {
    expect(
      headersFor({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: "https://api.example.com/api" }),
    ).toMatchSnapshot();
  });

  it("desarrollo, backend local", () => {
    expect(
      headersFor({ NODE_ENV: "development", NEXT_PUBLIC_API_URL: "http://localhost:5000/api" }),
    ).toMatchSnapshot();
  });
});

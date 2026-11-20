import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";

const base = { nonce: "NONCE", backendUrl: "https://api.example.com", isDev: false };

describe("buildCsp", () => {
  it("arma una sola línea con nonce y sin unsafe-inline en scripts", () => {
    const csp = buildCsp(base);
    expect(csp).not.toMatch(/\s{2,}|\n/);
    expect(csp).toContain("script-src 'self' 'nonce-NONCE' https://ecartpay.com");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp.endsWith("upgrade-insecure-requests;")).toBe(true);
  });

  it("usa wss del backend en producción y agrega localhost en desarrollo", () => {
    expect(buildCsp(base)).toContain("connect-src 'self' https://api.example.com wss://api.example.com https://*.ecartpay.com");
    expect(buildCsp({ ...base, isDev: true })).toContain(
      "ws://api.example.com http://localhost:5000 ws://localhost:5000 https://*.ecartpay.com",
    );
  });

  it("strictDynamic y ecartSandbox solo cambian script-src y frame-src", () => {
    const csp = buildCsp({ ...base, strictDynamic: true, ecartSandbox: true });
    expect(csp).toContain("'nonce-NONCE' 'strict-dynamic' https://ecartpay.com https://sandbox.ecartpay.com https://pay.ecart.com");
    expect(csp).toContain("frame-src https://ecartpay.com https://sandbox.ecartpay.com https://pay.ecart.com");
  });

  it("frameSrc reemplaza la lista completa", () => {
    expect(buildCsp({ ...base, frameSrc: ["https://a.test"] })).toContain("frame-src https://a.test;");
  });
});

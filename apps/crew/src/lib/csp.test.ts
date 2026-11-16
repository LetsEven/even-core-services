import { describe, expect, it } from "vitest";
import { buildCsp, clerkFrontendHost, cspProvider } from "./csp";
import { resolveAuthProvider } from "./auth/select";
import tauriConfRaw from "../../src-tauri/tauri.conf.json?raw";

const dir = (csp: string, name: string) =>
  (csp.split("; ").find((d) => d.startsWith(name + " ")) ?? "").split(" ").slice(1);

const b64 = (s: string) => btoa(s).replace(/=+$/, "");
const KEY_LIVE = `pk_live_${b64("clerk.letseven.io$")}`;
const KEY_TEST = `pk_test_${b64("fun-cat-1.clerk.accounts.dev$")}`;

describe("CSP por build", () => {
  it("demo: solo self (sin API, sin Clerk, sin Firebase)", () => {
    const c = buildCsp({ VITE_DEMO_MODE: "true", VITE_API_BASE_URL: "https://api.dev.example" });
    expect(dir(c, "connect-src")).toEqual(["'self'", "ipc:", "http://ipc.localhost"]);
    expect(dir(c, "script-src")).toEqual(["'self'"]);
    expect(dir(c, "style-src")).toEqual(["'self'"]);
    expect(c).not.toMatch(/clerk|google|cloudflare/);
  });

  it("local: API (https y wss) y crew-auth; sin Clerk", () => {
    const c = buildCsp({
      VITE_AUTH_PROVIDER: "local",
      VITE_API_BASE_URL: "https://api.example.com/",
      VITE_CREW_AUTH_URL: "https://crew-auth.up.railway.app",
    });
    const connect = dir(c, "connect-src");
    for (const s of ["https://api.example.com", "wss://api.example.com", "https://crew-auth.up.railway.app"]) {
      expect(connect).toContain(s);
    }
    expect(connect).toContain("https://fcmregistrations.googleapis.com");
    expect(c).not.toMatch(/clerk|cloudflare/);
    expect(dir(c, "style-src")).toEqual(["'self'"]);
  });

  it("http en desarrollo usa ws:", () => {
    expect(dir(buildCsp({ VITE_AUTH_PROVIDER: "local", VITE_API_BASE_URL: "http://localhost:3000" }), "connect-src")).toEqual(
      expect.arrayContaining(["http://localhost:3000", "ws://localhost:3000"]),
    );
  });

  it("clerk (default): su Frontend API sale de la clave publica; crew-auth no se permite", () => {
    const c = buildCsp({
      VITE_API_BASE_URL: "https://api.example.com",
      VITE_CREW_AUTH_URL: "https://crew-auth.example.com",
      VITE_CLERK_PUBLISHABLE_KEY: KEY_LIVE,
    });
    expect(dir(c, "script-src")).toEqual(["'self'", "https://clerk.letseven.io", "https://challenges.cloudflare.com"]);
    expect(dir(c, "connect-src")).toContain("https://clerk.letseven.io");
    expect(c).not.toContain("crew-auth.example.com");
    expect(dir(c, "style-src")).toContain("'unsafe-inline'");
    expect(clerkFrontendHost(KEY_TEST)).toBe("fun-cat-1.clerk.accounts.dev");
  });

  it("endurecimiento fijo y sin directivas que el meta ignora", () => {
    const c = buildCsp({ VITE_AUTH_PROVIDER: "local" });
    expect(dir(c, "object-src")).toEqual(["'none'"]);
    expect(dir(c, "base-uri")).toEqual(["'self'"]);
    expect(dir(c, "frame-src")).toEqual(["'none'"]);
    expect(c).not.toContain("frame-ancestors");
    expect(c).not.toContain("'unsafe-eval'");
    expect(dir(c, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("dev permite el script inline del refresh de React; build no", () => {
    expect(dir(buildCsp({ VITE_AUTH_PROVIDER: "local" }, { dev: true }), "script-src")).toContain("'unsafe-inline'");
    expect(dir(buildCsp({ VITE_AUTH_PROVIDER: "local" }), "script-src")).not.toContain("'unsafe-inline'");
  });

  it("configuracion invalida rompe el build en vez de emitir una politica floja", () => {
    expect(() => buildCsp({ VITE_AUTH_PROVIDER: "local", VITE_API_BASE_URL: "no es url" })).toThrow(/VITE_API_BASE_URL/);
    expect(() => buildCsp({ VITE_AUTH_PROVIDER: "local", VITE_API_BASE_URL: "javascript:alert(1)" })).toThrow();
    expect(() => buildCsp({ VITE_CLERK_PUBLISHABLE_KEY: "pk_live_@@@" })).toThrow(/CLERK/);
    expect(() => buildCsp({ VITE_AUTH_PROVIDER: "otro" })).toThrow(/invalido/);
  });

  it("el proveedor coincide con resolveAuthProvider del runtime", () => {
    for (const env of [
      {},
      { VITE_AUTH_PROVIDER: "local" },
      { VITE_AUTH_PROVIDER: " Clerk " },
      { VITE_AUTH_PROVIDER: "demo" },
      { VITE_DEMO_MODE: "true" },
      { VITE_DEMO_MODE: "true", VITE_API_BASE_URL: "https://api.letseven.io" },
    ]) {
      expect(cspProvider(env)).toBe(resolveAuthProvider(env));
    }
  });
});

// tauri.conf.json es estatico (no conoce las VITE_*): debe ser un superconjunto de lo que cualquier
// build pueda pedir. La politica efectiva es la interseccion con el meta de cada build.
describe("tauri.conf.json", () => {
  const conf = JSON.parse(tauriConfRaw) as {
    app: { security: { csp: string } };
  };
  const tauri = conf.app.security.csp;

  const allowed = (directive: string, src: string) =>
    dir(tauri, directive).some((p) => {
      if (p === src) return true;
      const m = /^(\w+:\/\/)\*\.(.+)$/.exec(p);
      return !!m && src.startsWith(m[1]!) && src.slice(m[1]!.length).endsWith("." + m[2]!);
    });

  it("no es null y cubre lo que piden los builds conocidos", () => {
    expect(tauri).toBeTruthy();
    const builds = [
      { VITE_API_BASE_URL: "https://api.letseven.io", VITE_CLERK_PUBLISHABLE_KEY: KEY_LIVE },
      { VITE_API_BASE_URL: "https://even-backend-dev.up.railway.app", VITE_CLERK_PUBLISHABLE_KEY: KEY_TEST },
      {
        VITE_AUTH_PROVIDER: "local",
        VITE_API_BASE_URL: "https://api.letseven.io",
        VITE_CREW_AUTH_URL: "https://crew-auth-production.up.railway.app",
      },
    ];
    for (const env of builds) {
      const meta = buildCsp(env);
      for (const d of ["script-src", "connect-src", "img-src", "frame-src"]) {
        for (const s of dir(meta, d)) {
          if (s.startsWith("'") && s !== "'self'") continue; // 'none', 'unsafe-inline'
          expect(allowed(d, s), `${d} ${s}`).toBe(true);
        }
      }
    }
  });

  it("endurecida: sin comodines globales ni eval", () => {
    expect(tauri).not.toMatch(/'unsafe-eval'|\s\*[\s;]|\shttps:[\s;]|\swss:[\s;]|\shttp:[\s;]/);
    expect(dir(tauri, "frame-ancestors")).toEqual(["'none'"]);
    expect(dir(tauri, "object-src")).toEqual(["'none'"]);
  });
});

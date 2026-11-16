// Content-Security-Policy de Crew, generada en build (plugin de vite.config.ts) a partir de las
// variables VITE_*: solo se permite lo que ese build necesita. Modulo puro (sin import.meta.env)
// porque lo importa tambien la config de vite (Node).
//
// Limites de <meta>: frame-ancestors, report-uri y sandbox no se aplican por meta (el navegador
// los ignora con un error en consola), asi que no se emiten aqui; frame-ancestors va en
// tauri.conf.json y, para la web, deberia ir como cabecera del servidor (Caddy).

export interface CspEnv {
  VITE_AUTH_PROVIDER?: string;
  VITE_DEMO_MODE?: string;
  VITE_API_BASE_URL?: string;
  VITE_CREW_AUTH_URL?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
}

export interface CspOptions {
  /** Servidor de desarrollo: permite el script inline del refresh de React y estilos inline. */
  dev?: boolean;
}

type Provider = "clerk" | "local" | "demo";

// Misma regla que resolveAuthProvider (src/lib/auth/select.ts); csp.test.ts verifica que coincidan.
export function cspProvider(env: CspEnv): Provider {
  const raw = (env.VITE_AUTH_PROVIDER ?? "").trim().toLowerCase();
  if (env.VITE_DEMO_MODE === "true" || raw === "demo") return "demo";
  if (raw === "") return "clerk";
  if (raw === "clerk" || raw === "local") return raw;
  throw new Error(`VITE_AUTH_PROVIDER invalido: "${env.VITE_AUTH_PROVIDER}". Usa clerk, local o demo.`);
}

/** Origen http(s) de una URL de configuracion y su equivalente de websocket. */
function origins(value: string | undefined, name: string): string[] {
  const v = (value ?? "").trim();
  if (!v) return [];
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`${name} invalida: "${v}"`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`${name} debe ser http(s): "${v}"`);
  const ws = u.protocol === "https:" ? "wss:" : "ws:";
  return [u.origin, `${ws}//${u.host}`];
}

/** Host del Frontend API de Clerk: la clave publica es pk_(test|live)_<base64("host$")>. */
export function clerkFrontendHost(key: string | undefined): string | null {
  const k = (key ?? "").trim();
  if (!k) return null;
  const m = /^pk_(?:test|live)_([A-Za-z0-9+/_-]+=*)$/.exec(k);
  if (!m) throw new Error("VITE_CLERK_PUBLISHABLE_KEY invalida");
  const b64 = (m[1] ?? "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  let host: string;
  try {
    host = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/\$$/, "");
  } catch {
    throw new Error("VITE_CLERK_PUBLISHABLE_KEY invalida");
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw new Error("VITE_CLERK_PUBLISHABLE_KEY invalida");
  return host.toLowerCase();
}

const FIREBASE_CONNECT = [
  "https://fcmregistrations.googleapis.com",
  "https://firebaseinstallations.googleapis.com",
];

export function buildCsp(env: CspEnv, opts: CspOptions = {}): string {
  const provider = cspProvider(env);
  const dev = opts.dev === true;
  const clerk = provider === "clerk";

  const fapi = clerk ? clerkFrontendHost(env.VITE_CLERK_PUBLISHABLE_KEY) : null;
  const clerkScripts = clerk ? [...(fapi ? [`https://${fapi}`] : []), "https://challenges.cloudflare.com"] : [];

  const connect = [
    "'self'",
    // Tauri: IPC de invoke().
    "ipc:",
    "http://ipc.localhost",
    ...(provider === "demo" ? [] : origins(env.VITE_API_BASE_URL, "VITE_API_BASE_URL")),
    ...(provider === "local" ? origins(env.VITE_CREW_AUTH_URL, "VITE_CREW_AUTH_URL") : []),
    ...(provider === "demo" ? [] : FIREBASE_CONNECT),
    ...(clerk ? [...(fapi ? [`https://${fapi}`] : []), "https://clerk-telemetry.com"] : []),
  ];

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", ...clerkScripts, ...(dev ? ["'unsafe-inline'"] : [])]],
    // Vite incrusta como data: las fuentes propias pequenas (font-src data:). Clerk (emotion) inyecta <style>; el resto de builds usa solo la hoja propia.
    ["style-src", ["'self'", ...(clerk || dev ? ["'unsafe-inline'"] : [])]],
    ["font-src", ["'self'", "data:"]],
    ["img-src", ["'self'", "data:", "blob:", ...(clerk ? ["https://img.clerk.com"] : [])]],
    ["connect-src", connect],
    ["worker-src", ["'self'", ...(clerk ? ["blob:"] : [])]],
    ["manifest-src", ["'self'"]],
    ["frame-src", clerk ? ["https://challenges.cloudflare.com"] : ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  return directives.map(([d, v]) => `${d} ${[...new Set(v)].join(" ")}`).join("; ");
}

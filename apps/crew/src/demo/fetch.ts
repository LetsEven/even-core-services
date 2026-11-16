// Wrapper de window.fetch instalado solo en demo: todo lo que apunte a la API
// (/api/...) se responde con el store en memoria y nunca sale a la red.
import { handleDemoRequest } from "./handlers";
import { getDemoStore, type DemoStore } from "./store";

interface Options {
  /** Latencia simulada en ms (0 en tests). */
  latencyMs?: number;
  baseUrl?: string;
}

function parseBody(init?: RequestInit): unknown {
  const raw = init?.body;
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Ruta /api/... si la peticion es para la API, o null si no lo es. */
export function apiPathOf(url: string, baseUrl?: string): string | null {
  let u: URL;
  try {
    u = new URL(url, window.location.href);
  } catch {
    return null;
  }
  let apiOrigin: string | null = null;
  try {
    apiOrigin = baseUrl ? new URL(baseUrl).origin : null;
  } catch {
    apiOrigin = null;
  }
  if (u.origin !== window.location.origin && u.origin !== apiOrigin) return null;
  const idx = u.pathname.indexOf("/api/");
  if (idx === -1) return null;
  return `${u.pathname.slice(idx)}${u.search}`;
}

export function createDemoFetch(
  realFetch: typeof fetch,
  store: DemoStore,
  { latencyMs = 120, baseUrl }: Options = {},
): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = apiPathOf(url, baseUrl);
    if (path === null) return realFetch(input, init);

    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
    const result = handleDemoRequest(store, { method, url: path, body: parseBody(init) });

    if (result.pdf) {
      return new Response(result.pdf as BlobPart, {
        status: result.status,
        headers: { "Content-Type": "application/pdf" },
      });
    }
    return new Response(JSON.stringify(result.json ?? {}), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

export function installDemoFetch(): void {
  const real = window.fetch.bind(window);
  window.fetch = createDemoFetch(real, getDemoStore(), {
    baseUrl: import.meta.env.VITE_API_BASE_URL,
  });
}

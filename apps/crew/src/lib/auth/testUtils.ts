// Utilidades de prueba para auth (no se importan desde codigo de la app).

const b64url = (o: unknown) =>
  btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** JWT de acceso falso (sin firma real) con los claims del contrato. */
export function makeAccessToken(
  claims: Partial<{
    sub: string;
    role: string;
    permissions: string[];
    expSec: number;
    branchId: string;
  }> = {},
  nowMs = Date.now(),
): string {
  const exp = claims.expSec ?? Math.floor(nowMs / 1000) + 15 * 60;
  return [
    b64url({ alg: "EdDSA", typ: "JWT" }),
    b64url({
      iss: "crew-auth",
      aud: "even-crew",
      sub: claims.sub ?? "u1",
      role: claims.role ?? "mesero",
      permissions: claims.permissions ?? [
        "mesas.ver",
        "comanda.crear",
        "cuenta.ver",
        "cuenta.cobrar",
      ],
      branchId: claims.branchId ?? "b1",
      exp,
    }),
    "sig",
  ].join(".");
}

export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(initial));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

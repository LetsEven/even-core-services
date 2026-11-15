// Cliente tipado del servicio crew-auth (contrato API v1). Solo habla con
// VITE_CREW_AUTH_URL; el modo demo jamas lo usa.
//
// El contrato fija rutas, cuerpos de entrada y la forma de login/pair. Donde
// no fija la forma exacta de la respuesta (listas, admin) el cliente acepta
// variantes comunes y normaliza; los supuestos estan marcados con SUPUESTO y
// hay que confirmarlos contra apps/crew-auth.

import { isRole, type Role } from "./roles";

export class CrewAuthError extends Error {
  readonly status: number;
  /** Segundos sugeridos por Retry-After (lockout / rate limit), si vino. */
  readonly retryAfter: number | null;
  constructor(status: number, retryAfter: number | null = null) {
    // Mensaje generico a proposito: nunca se propaga texto del servidor.
    super(`crew-auth ${status}`);
    this.name = "CrewAuthError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
  /** Lockout (423) o rate limit (429). */
  get isLocked(): boolean {
    return this.status === 423 || this.status === 429;
  }
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface SelectorUser {
  id: string;
  name: string;
  role: Role;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; role: Role };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  /** Solo si el servicio lo devuelve. */
  userName?: string;
}

export interface PairResult {
  deviceToken: string;
  branchId: string;
}

export interface AdminUser {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface PairingCode {
  code: string;
  expiresAt: string | null;
}

export interface LocalClient {
  pair(pairingCode: string): Promise<PairResult>;
  listUsers(deviceToken: string, branchId: string): Promise<SelectorUser[]>;
  login(deviceToken: string, userId: string, pin: string): Promise<LoginResult>;
  refresh(deviceToken: string, refreshToken: string): Promise<RefreshResult>;
  logout(deviceToken: string, refreshToken: string): Promise<void>;
  // Administracion (solo super; access token).
  adminListUsers(accessToken: string, branchId: string): Promise<AdminUser[]>;
  adminCreateUser(
    accessToken: string,
    input: { branchId: string; name: string; role: Role; pin: string },
  ): Promise<AdminUser>;
  adminUpdateUser(
    accessToken: string,
    id: string,
    patch: { name?: string; role?: Role; active?: boolean },
  ): Promise<AdminUser>;
  adminResetPin(accessToken: string, id: string, pin: string): Promise<void>;
  adminCreatePairingCode(
    accessToken: string,
    branchId: string,
  ): Promise<PairingCode>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;
const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;

function bad(): never {
  throw new CrewAuthError(502);
}

function parseSelectorUser(v: unknown): SelectorUser {
  if (!isObj(v)) return bad();
  const id = str(v.id);
  const name = str(v.name);
  if (!id || name === null || !isRole(v.role)) return bad();
  return { id, name, role: v.role };
}

function parseAdminUser(v: unknown): AdminUser {
  const u = parseSelectorUser(v);
  return { ...u, active: isObj(v) && v.active === false ? false : true };
}

// SUPUESTO: la lista llega como arreglo o como { users: [...] }.
function listOf(body: unknown, key = "users"): unknown[] {
  if (Array.isArray(body)) return body;
  if (isObj(body) && Array.isArray(body[key])) return body[key] as unknown[];
  return bad();
}

export function createLocalClient(opts: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): LocalClient {
  const base = opts.baseUrl.replace(/\/+$/, "");

  async function call(
    method: string,
    path: string,
    o: { bearer?: string; body?: unknown } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (o.bearer) headers.Authorization = `Bearer ${o.bearer}`;
    if (o.body !== undefined) headers["Content-Type"] = "application/json";
    let res: Response;
    try {
      // fetch global resuelto en cada llamada (no al crear el cliente) para
      // respetar el wrapper de fetch si algun dia se instala.
      res = await (opts.fetchImpl ?? fetch)(`${base}${path}`, {
        method,
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      });
    } catch {
      throw new CrewAuthError(0);
    }
    if (!res.ok) {
      const ra = Number(res.headers.get("Retry-After"));
      throw new CrewAuthError(res.status, Number.isFinite(ra) && ra > 0 ? ra : null);
    }
    if (res.status === 204) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  return {
    async pair(pairingCode) {
      const b = await call("POST", "/v1/devices/pair", { body: { pairingCode } });
      if (!isObj(b)) return bad();
      const deviceToken = str(b.deviceToken);
      const branchId = str(b.branchId);
      if (!deviceToken || !branchId) return bad();
      return { deviceToken, branchId };
    },

    async listUsers(deviceToken, branchId) {
      const b = await call(
        "GET",
        `/v1/users?branchId=${encodeURIComponent(branchId)}`,
        { bearer: deviceToken },
      );
      return listOf(b).map(parseSelectorUser);
    },

    async login(deviceToken, userId, pin) {
      const b = await call("POST", "/v1/login", {
        bearer: deviceToken,
        body: { userId, pin },
      });
      if (!isObj(b) || !isObj(b.user)) return bad();
      const accessToken = str(b.accessToken);
      const refreshToken = str(b.refreshToken);
      const id = str(b.user.id);
      if (!accessToken || !refreshToken || !id || !isRole(b.user.role)) return bad();
      return {
        accessToken,
        refreshToken,
        user: {
          id,
          name: typeof b.user.name === "string" ? b.user.name : "",
          role: b.user.role,
        },
      };
    },

    // SUPUESTO: refresh/logout llevan el token del dispositivo como Bearer
    // (igual que login) y el refresh token en el cuerpo.
    async refresh(deviceToken, refreshToken) {
      const b = await call("POST", "/v1/refresh", {
        bearer: deviceToken,
        body: { refreshToken },
      });
      if (!isObj(b)) return bad();
      const accessToken = str(b.accessToken);
      const next = str(b.refreshToken);
      if (!accessToken || !next) return bad();
      return {
        accessToken,
        refreshToken: next,
        userName: isObj(b.user) && typeof b.user.name === "string" ? b.user.name : undefined,
      };
    },

    async logout(deviceToken, refreshToken) {
      await call("POST", "/v1/logout", {
        bearer: deviceToken,
        body: { refreshToken },
      });
    },

    // SUPUESTO: el admin lista todos los usuarios (activos o no) con
    // GET /v1/users?branchId=&includeInactive=true y access token de super.
    async adminListUsers(accessToken, branchId) {
      const b = await call(
        "GET",
        `/v1/users?branchId=${encodeURIComponent(branchId)}&includeInactive=true`,
        { bearer: accessToken },
      );
      return listOf(b).map(parseAdminUser);
    },

    async adminCreateUser(accessToken, input) {
      const b = await call("POST", "/v1/users", { bearer: accessToken, body: input });
      return parseAdminUser(isObj(b) && isObj(b.user) ? b.user : b);
    },

    async adminUpdateUser(accessToken, id, patch) {
      const b = await call("PATCH", `/v1/users/${encodeURIComponent(id)}`, {
        bearer: accessToken,
        body: patch,
      });
      return parseAdminUser(isObj(b) && isObj(b.user) ? b.user : b);
    },

    // SUPUESTO: POST /v1/users/:id/reset-pin { pin }.
    async adminResetPin(accessToken, id, pin) {
      await call("POST", `/v1/users/${encodeURIComponent(id)}/reset-pin`, {
        bearer: accessToken,
        body: { pin },
      });
    },

    // SUPUESTO: cuerpo { branchId }; respuesta { code | pairingCode, expiresAt }.
    async adminCreatePairingCode(accessToken, branchId) {
      const b = await call("POST", "/v1/devices/pairing-codes", {
        bearer: accessToken,
        body: { branchId },
      });
      if (!isObj(b)) return bad();
      const code = str(b.code) ?? str(b.pairingCode);
      if (!code) return bad();
      return { code, expiresAt: str(b.expiresAt) };
    },
  };
}

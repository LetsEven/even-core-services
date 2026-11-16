// Cliente tipado del servicio crew-auth (contrato API v1). Solo habla con
// VITE_CREW_AUTH_URL; el modo demo jamas lo usa.
//
// Alineado con las rutas reales de apps/crew-auth (src/routes/*):
//  - token de dispositivo (pair -> login/refresh/logout/lista): cabecera
//    `X-Device-Token`; access token JWT: `Authorization: Bearer`.
//  - listas y entidades llegan envueltas ({ users }, { user }).
//  - el lockout del usuario responde 401 generico (igual que un PIN malo); solo
//    el rate limit por IP/dispositivo responde 429 con Retry-After.

import { isRole, type Role } from "./roles";

export class CrewAuthError extends Error {
  readonly status: number;
  /** Segundos sugeridos por Retry-After (rate limit), si vino. */
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
  /** Rate limit (429). El lockout por PIN llega como 401 generico y no se distingue. */
  get isLocked(): boolean {
    return this.status === 429;
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
  branchId: string;
  cocinaOperar: boolean;
  /** ms epoch hasta cuando esta bloqueado (global o en algun dispositivo), si lo esta. */
  lockedUntil: number | null;
}

export interface PairingCode {
  code: string;
  /** ms epoch (el servicio lo devuelve numerico). */
  expiresAt: number | null;
}

export interface AdminDevice {
  id: string;
  name: string;
  branchId: string;
  /** ms epoch del ultimo uso, si hubo. */
  lastSeenAt: number | null;
  /** Es el dispositivo desde el que se hizo la consulta. */
  current: boolean;
}

export interface LocalClient {
  pair(pairingCode: string): Promise<PairResult>;
  listUsers(deviceToken: string, branchId: string): Promise<SelectorUser[]>;
  login(deviceToken: string, userId: string, pin: string): Promise<LoginResult>;
  refresh(deviceToken: string, refreshToken: string): Promise<RefreshResult>;
  logout(deviceToken: string, refreshToken: string): Promise<void>;
  // Administracion (solo super; access token).
  /** Todos los usuarios del restaurante (activos e inactivos), filtrados por sucursal. */
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
  /** Quita el bloqueo por intentos fallidos sin cambiar el PIN (POST /v1/users/:id/unlock). */
  adminUnlockUser(accessToken: string, id: string): Promise<void>;
  adminCreatePairingCode(
    accessToken: string,
    branchId: string,
  ): Promise<PairingCode>;
  /** Dispositivos vinculados del restaurante del super (GET /v1/devices). */
  adminListDevices(accessToken: string): Promise<AdminDevice[]>;
  /** Revoca el dispositivo y todas sus sesiones (DELETE /v1/devices/:id). */
  adminRevokeDevice(accessToken: string, id: string): Promise<void>;
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
  if (!isObj(v) || typeof v.active !== "boolean") return bad();
  return {
    ...u,
    active: v.active,
    branchId: str(v.branchId) ?? "",
    cocinaOperar: v.cocinaOperar === true,
    lockedUntil: typeof v.lockedUntil === "number" ? v.lockedUntil : null,
  };
}

function parseAdminDevice(v: unknown): AdminDevice {
  if (!isObj(v)) return bad();
  const id = str(v.id);
  const name = str(v.name);
  if (!id || name === null) return bad();
  return {
    id,
    name,
    branchId: str(v.branchId) ?? "",
    lastSeenAt: typeof v.lastSeenAt === "number" ? v.lastSeenAt : null,
    current: v.current === true,
  };
}

// El servicio siempre envuelve: { users: [...] }.
function listOf(body: unknown): unknown[] {
  if (isObj(body) && Array.isArray(body.users)) return body.users;
  return bad();
}

function userOf(body: unknown): unknown {
  return isObj(body) ? body.user : bad();
}

/** Tiempo maximo de cada llamada al servicio (conexion + cuerpo). */
export const REQUEST_TIMEOUT_MS = 15_000;

export function createLocalClient(opts: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): LocalClient {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function call(
    method: string,
    path: string,
    o: { bearer?: string; device?: string; body?: unknown } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (o.bearer) headers.Authorization = `Bearer ${o.bearer}`;
    if (o.device) headers["X-Device-Token"] = o.device;
    if (o.body !== undefined) headers["Content-Type"] = "application/json";
    // Timeout con AbortController. Ademas se compite contra la senal para que
    // venza aunque la implementacion de fetch la ignore (o el cuerpo se cuelgue).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const aborted = new Promise<never>((_, reject) => {
      ctrl.signal.addEventListener("abort", () => reject(new Error("timeout")));
    });
    aborted.catch(() => {});
    try {
      // fetch global resuelto en cada llamada (no al crear el cliente) para
      // respetar el wrapper de fetch si algun dia se instala.
      const res = await Promise.race([
        (opts.fetchImpl ?? fetch)(`${base}${path}`, {
          method,
          headers,
          body: o.body === undefined ? undefined : JSON.stringify(o.body),
          signal: ctrl.signal,
        }),
        aborted,
      ]);
      if (!res.ok) {
        const ra = Number(res.headers.get("Retry-After"));
        throw new CrewAuthError(res.status, Number.isFinite(ra) && ra > 0 ? ra : null);
      }
      if (res.status === 204) return null;
      try {
        return await Promise.race([res.json(), aborted]);
      } catch {
        return null;
      }
    } catch (e) {
      if (e instanceof CrewAuthError) throw e;
      throw new CrewAuthError(0); // red o timeout: transitorio
    } finally {
      clearTimeout(timer);
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
        { device: deviceToken },
      );
      return listOf(b).map(parseSelectorUser);
    },

    async login(deviceToken, userId, pin) {
      const b = await call("POST", "/v1/login", {
        device: deviceToken,
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

    // El servicio exige X-Device-Token y que sea el dispositivo de la sesion
    // (un refresh token robado no sirve desde otro equipo).
    async refresh(deviceToken, refreshToken) {
      const b = await call("POST", "/v1/refresh", {
        device: deviceToken,
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
        device: deviceToken,
        body: { refreshToken },
      });
    },

    // GET /v1/admin/users (super): activos e inactivos de todo el restaurante;
    // se filtra por sucursal aqui.
    async adminListUsers(accessToken, branchId) {
      const b = await call("GET", "/v1/admin/users", { bearer: accessToken });
      return listOf(b)
        .map(parseAdminUser)
        .filter((u) => u.branchId === branchId);
    },

    async adminCreateUser(accessToken, input) {
      const b = await call("POST", "/v1/users", { bearer: accessToken, body: input });
      return parseAdminUser(userOf(b));
    },

    async adminUpdateUser(accessToken, id, patch) {
      const b = await call("PATCH", `/v1/users/${encodeURIComponent(id)}`, {
        bearer: accessToken,
        body: patch,
      });
      return parseAdminUser(userOf(b));
    },

    async adminResetPin(accessToken, id, pin) {
      await call("POST", `/v1/users/${encodeURIComponent(id)}/reset-pin`, {
        bearer: accessToken,
        body: { pin },
      });
    },

    async adminUnlockUser(accessToken, id) {
      await call("POST", `/v1/users/${encodeURIComponent(id)}/unlock`, {
        bearer: accessToken,
      });
    },

    // POST /v1/devices/pairing-codes { branchId } -> 201 { pairingCode, branchId, expiresAt }.
    async adminCreatePairingCode(accessToken, branchId) {
      const b = await call("POST", "/v1/devices/pairing-codes", {
        bearer: accessToken,
        body: { branchId },
      });
      if (!isObj(b)) return bad();
      const code = str(b.pairingCode);
      if (!code) return bad();
      return {
        code,
        expiresAt: typeof b.expiresAt === "number" ? b.expiresAt : null,
      };
    },

    async adminListDevices(accessToken) {
      const b = await call("GET", "/v1/devices", { bearer: accessToken });
      if (!isObj(b) || !Array.isArray(b.devices)) return bad();
      return b.devices.map(parseAdminDevice);
    },

    async adminRevokeDevice(accessToken, id) {
      await call("DELETE", `/v1/devices/${encodeURIComponent(id)}`, {
        bearer: accessToken,
      });
    },
  };
}

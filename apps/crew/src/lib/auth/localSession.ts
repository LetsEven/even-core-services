// Sesion local (crew-auth) sin React: access token solo en memoria, refresh
// token rotativo en localStorage, refresh automatico antes de expirar. El
// proveedor React (local.tsx) solo expone este controlador.

import { CrewAuthError, type LocalClient, type SelectorUser } from "./localClient";
import { decodeAccessClaims } from "./jwt";
import type { AuthStatus, AuthUser } from "./types";

export const DEVICE_KEY = "crew_auth_device";
export const SESSION_KEY = "crew_auth_session";

/** Refresca este tiempo antes de que expire el access token. */
export const REFRESH_MARGIN_MS = 60_000;
/** Por debajo de este margen, getToken() refresca antes de devolver. */
const STALE_MARGIN_MS = 10_000;
const RETRY_MS = 15_000;

export interface LocalSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
  paired: boolean;
  branchId: string | null;
}

interface DeviceRecord {
  deviceToken: string;
  branchId: string;
}
interface SessionRecord {
  refreshToken: string;
  name: string;
}

function readJson<T>(storage: Storage | null, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(storage: Storage | null, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* sin storage: la sesion dura lo que dure la pestana */
  }
}
function removeKey(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    /* sin storage */
  }
}
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const isDevice = (d: DeviceRecord | null): d is DeviceRecord =>
  !!d && typeof d.deviceToken === "string" && typeof d.branchId === "string";
const isSession = (s: SessionRecord | null): s is SessionRecord =>
  !!s && typeof s.refreshToken === "string";

// Un fallo que no depende de la sesion (red, 5xx, rate limit) no la invalida.
function isTransient(e: unknown): boolean {
  return (
    e instanceof CrewAuthError &&
    (e.status === 0 || e.status >= 500 || e.status === 429)
  );
}

export interface LocalAuthController {
  getSnapshot(): LocalSnapshot;
  subscribe(listener: () => void): () => void;
  /** Arranca (una vez) la restauracion de sesion y el refresh automatico. */
  start(): Promise<void>;
  /** Detiene el temporizador de refresh (desmontaje). */
  stop(): void;
  pair(pairingCode: string): Promise<void>;
  unpair(): void;
  listUsers(): Promise<SelectorUser[]>;
  login(userId: string, pin: string): Promise<void>;
  getToken(): Promise<string | null>;
  signOut(): Promise<void>;
}

export function createLocalAuth(opts: {
  client: LocalClient;
  storage?: Storage | null;
  now?: () => number;
}): LocalAuthController {
  const { client } = opts;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now;

  let device = readJson<DeviceRecord>(storage, DEVICE_KEY);
  if (!isDevice(device)) device = null;
  let session = readJson<SessionRecord>(storage, SESSION_KEY);
  if (!isSession(session)) session = null;

  // Access token: solo memoria.
  let accessToken: string | null = null;
  let expiresAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<boolean> | null = null;
  let started: Promise<void> | null = null;

  let snapshot: LocalSnapshot = {
    status: device && session ? "loading" : "signedOut",
    user: null,
    paired: device !== null,
    branchId: device?.branchId ?? null,
  };
  const listeners = new Set<() => void>();
  function set(patch: Partial<LocalSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l());
  }

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }
  function schedule(delay?: number) {
    clearTimer();
    if (!accessToken && delay === undefined) return;
    const ms = delay ?? Math.max(1_000, expiresAt - now() - REFRESH_MARGIN_MS);
    timer = setTimeout(() => void refresh(), ms);
  }

  function dropSession() {
    clearTimer();
    accessToken = null;
    expiresAt = 0;
    session = null;
    removeKey(storage, SESSION_KEY);
    set({ status: "signedOut", user: null });
  }

  /** Aplica tokens nuevos; false si el access token no trae claims validos. */
  function apply(access: string, refreshTok: string, name: string): boolean {
    const claims = decodeAccessClaims(access);
    if (!claims) return false;
    accessToken = access;
    expiresAt = claims.expiresAt;
    session = { refreshToken: refreshTok, name };
    writeJson(storage, SESSION_KEY, session);
    set({
      status: "signedIn",
      user: {
        id: claims.sub,
        name,
        role: claims.role,
        permissions: claims.permissions,
      },
    });
    schedule();
    return true;
  }

  async function doRefresh(): Promise<boolean> {
    if (!device || !session) {
      dropSession();
      return false;
    }
    try {
      const r = await client.refresh(device.deviceToken, session.refreshToken);
      const name = r.userName ?? session.name;
      if (!apply(r.accessToken, r.refreshToken, name)) {
        dropSession();
        return false;
      }
      return true;
    } catch (e) {
      if (isTransient(e)) {
        // Sigue la sesion en memoria (si el token aun vale); se reintenta.
        if (snapshot.status === "signedIn") schedule(RETRY_MS);
        return false;
      }
      dropSession();
      return false;
    }
  }

  // Una sola peticion de refresh a la vez: el refresh token rota, dos en
  // paralelo invalidarian la sesion.
  function refresh(): Promise<boolean> {
    if (!inflight) {
      inflight = doRefresh().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  function unpair() {
    device = null;
    removeKey(storage, DEVICE_KEY);
    dropSession();
    set({ paired: false, branchId: null });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    start() {
      if (!started) {
        started = (async () => {
          if (snapshot.status === "loading") {
            const ok = await refresh();
            // Sin red al arrancar: pide PIN de nuevo (el refresh token se
            // conserva y se reemplaza al iniciar sesion).
            if (!ok && snapshot.status === "loading") set({ status: "signedOut" });
          }
        })();
      } else if (accessToken) {
        schedule();
      }
      return started;
    },
    stop: clearTimer,

    async pair(pairingCode) {
      const r = await client.pair(pairingCode.trim());
      device = { deviceToken: r.deviceToken, branchId: r.branchId };
      writeJson(storage, DEVICE_KEY, device);
      set({ paired: true, branchId: r.branchId });
    },

    unpair,

    async listUsers() {
      if (!device) throw new CrewAuthError(401);
      try {
        return await client.listUsers(device.deviceToken, device.branchId);
      } catch (e) {
        // Dispositivo revocado: hay que emparejar de nuevo.
        if (e instanceof CrewAuthError && e.isUnauthorized) unpair();
        throw e;
      }
    },

    async login(userId, pin) {
      if (!device) throw new CrewAuthError(401);
      const r = await client.login(device.deviceToken, userId, pin);
      if (!apply(r.accessToken, r.refreshToken, r.user.name)) {
        throw new CrewAuthError(502);
      }
    },

    async getToken() {
      if (!accessToken) return null;
      if (expiresAt - now() > STALE_MARGIN_MS) return accessToken;
      await refresh();
      return accessToken && expiresAt - now() > 0 ? accessToken : null;
    },

    async signOut() {
      const rt = session?.refreshToken;
      const dt = device?.deviceToken;
      dropSession();
      if (rt && dt) {
        try {
          await client.logout(dt, rt);
        } catch {
          /* sin red: el refresh token vence solo (12 h) */
        }
      }
    },
  };
}

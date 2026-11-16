// Sesion local (crew-auth) sin React: access token solo en memoria, refresh
// token rotativo en localStorage, refresh automatico antes de expirar. El
// proveedor React (local.tsx) solo expone este controlador.
//
// Varias pestanas comparten el mismo refresh token (localStorage) y el servicio
// lo rota en cada uso: reutilizar uno viejo revoca las sesiones del usuario en
// el dispositivo, y al rotar tambien deja de valer el access token anterior
// (su `sid`). Por eso:
//  - cada refresh corre bajo un lock entre pestanas (navigator.locks; si no
//    existe, un lease en localStorage; si tampoco, sin coordinacion) y SIEMPRE
//    parte del refresh token guardado, nunca del que la pestana tiene en memoria;
//  - la pestana que rota difunde el access token nuevo por BroadcastChannel
//    (solo memoria, mismo origen) y las demas lo adoptan sin llamar al servicio;
//  - un cierre de sesion se propaga igual.

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
/** Espera entre reintentos del refresh al arrancar sin red, antes de pedir PIN. */
export const START_RETRY_DELAYS_MS: readonly number[] = [500, 1_000, 2_000, 4_000, 8_000];

const LOCK_NAME = "crew-auth-refresh";
const LEASE_KEY = "crew_auth_refresh_lease";
const CHANNEL_NAME = "crew-auth";
const LEASE_TTL_MS = 20_000;
const LEASE_WAIT_MS = 8_000;
const LEASE_POLL_MS = 100;

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

/** Subconjunto de navigator.locks (inyectable en pruebas). */
export interface LockManagerLike {
  request<T>(name: string, options: { mode: "exclusive" }, cb: () => Promise<T>): Promise<T>;
}
/** Subconjunto de BroadcastChannel (inyectable en pruebas). */
export interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

function defaultLocks(): LockManagerLike | null {
  try {
    const l = (globalThis as { navigator?: { locks?: unknown } }).navigator?.locks;
    return l ? (l as LockManagerLike) : null;
  } catch {
    return null;
  }
}
function defaultChannelFactory(): ChannelLike | null {
  try {
    return typeof BroadcastChannel === "function"
      ? (new BroadcastChannel(CHANNEL_NAME) as unknown as ChannelLike)
      : null;
  } catch {
    return null;
  }
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RefreshOutcome = "ok" | "transient" | "rejected";

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
  /** Lock entre pestanas; por defecto navigator.locks (null = sin Web Locks). */
  locks?: LockManagerLike | null;
  /** Canal entre pestanas; por defecto BroadcastChannel (null = sin canal). */
  channel?: (() => ChannelLike | null) | null;
  /** Esperas de los reintentos al restaurar la sesion sin red. */
  startRetryDelaysMs?: readonly number[];
}): LocalAuthController {
  const { client } = opts;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const now = opts.now ?? Date.now;
  const locks = opts.locks === undefined ? defaultLocks() : opts.locks;
  const openChannel = opts.channel === undefined ? defaultChannelFactory : (opts.channel ?? (() => null));
  const startRetryDelays = opts.startRetryDelaysMs ?? START_RETRY_DELAYS_MS;
  const ownerId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  // Con storage inutilizable (privado/bloqueado) no hay nada que compartir.
  const storageUsable = (() => {
    if (!storage) return false;
    try {
      storage.setItem("crew_auth_probe", "1");
      storage.removeItem("crew_auth_probe");
      return true;
    } catch {
      return false;
    }
  })();

  let device = readJson<DeviceRecord>(storage, DEVICE_KEY);
  if (!isDevice(device)) device = null;
  let session = readJson<SessionRecord>(storage, SESSION_KEY);
  if (!isSession(session)) session = null;

  // Access token: solo memoria.
  let accessToken: string | null = null;
  let expiresAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<RefreshOutcome> | null = null;
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

  let channel: ChannelLike | null = null;
  function broadcast(message: unknown) {
    try {
      channel?.postMessage(message);
    } catch {
      /* sin canal: las demas pestanas se enteran en su proximo refresh */
    }
  }

  function setSignedIn(access: string, name: string): boolean {
    const claims = decodeAccessClaims(access);
    if (!claims) return false;
    accessToken = access;
    expiresAt = claims.expiresAt;
    set({
      status: "signedIn",
      user: { id: claims.sub, name, role: claims.role, permissions: claims.permissions },
    });
    schedule();
    return true;
  }

  /** Aplica tokens nuevos; false si el access token no trae claims validos. */
  function apply(access: string, refreshTok: string, name: string): boolean {
    if (!setSignedIn(access, name)) return false;
    session = { refreshToken: refreshTok, name };
    writeJson(storage, SESSION_KEY, session);
    broadcast({ t: "token", accessToken: access, name });
    return true;
  }

  function storedSession(): SessionRecord | null {
    const s = readJson<SessionRecord>(storage, SESSION_KEY);
    return isSession(s) ? s : null;
  }

  // Otra pestana roto el refresh token y nos paso el access token nuevo: lo
  // adoptamos (evita un refresh propio y mantiene todas las pestanas al dia).
  function onPeerMessage(data: unknown) {
    if (typeof data !== "object" || data === null) return;
    const m = data as Record<string, unknown>;
    if (m.t === "signout") {
      if (session || snapshot.status !== "signedOut") dropSession();
    } else if (m.t === "token" && typeof m.accessToken === "string" && typeof m.name === "string") {
      const claims = decodeAccessClaims(m.accessToken);
      if (!claims || claims.expiresAt <= now()) return;
      // El lock serializa las rotaciones: lo ultimo difundido es lo vigente. Solo se
      // descarta lo claramente mas viejo (exp en segundos: mismo segundo = adoptar).
      if (m.accessToken === accessToken || (accessToken && claims.expiresAt < expiresAt)) return;
      const stored = storedSession();
      if (!stored) return;
      session = stored;
      setSignedIn(m.accessToken, m.name);
    }
  }

  // Lease en localStorage para navegadores sin Web Locks. No es atomico, pero
  // escribe y relee para detectar al otro dueno.
  async function acquireLease(): Promise<boolean> {
    const deadline = Date.now() + LEASE_WAIT_MS;
    for (;;) {
      const cur = readJson<{ owner: string; until: number }>(storage, LEASE_KEY);
      if (!cur || cur.until <= Date.now() || cur.owner === ownerId) {
        writeJson(storage, LEASE_KEY, { owner: ownerId, until: Date.now() + LEASE_TTL_MS });
        if (readJson<{ owner: string }>(storage, LEASE_KEY)?.owner === ownerId) return true;
      }
      if (Date.now() >= deadline) return false;
      await sleep(LEASE_POLL_MS);
    }
  }

  async function withRefreshLock<T>(fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
    if (locks) return { ran: true, value: await locks.request(LOCK_NAME, { mode: "exclusive" }, fn) };
    if (!storageUsable) return { ran: true, value: await fn() };
    if (!(await acquireLease())) return { ran: false };
    try {
      return { ran: true, value: await fn() };
    } finally {
      if (readJson<{ owner: string }>(storage, LEASE_KEY)?.owner === ownerId) removeKey(storage, LEASE_KEY);
    }
  }

  async function attemptRefresh(): Promise<RefreshOutcome> {
    if (!device) {
      dropSession();
      return "rejected";
    }
    // Otra pestana pudo renovar mientras esperabamos el lock (y avisarnos).
    if (accessToken && expiresAt - now() > REFRESH_MARGIN_MS) return "ok";
    // La fuente de verdad del refresh token es el storage, no la memoria.
    const current = storageUsable ? storedSession() : session;
    if (!current) {
      // Otra pestana cerro sesion: no se toca el servicio con un token revocado
      // (reutilizarlo revocaria sesiones vigentes).
      dropSession();
      return "rejected";
    }
    session = current;
    try {
      const r = await client.refresh(device.deviceToken, current.refreshToken);
      const name = r.userName ?? current.name;
      if (!apply(r.accessToken, r.refreshToken, name)) {
        dropSession();
        return "rejected";
      }
      return "ok";
    } catch (e) {
      if (isTransient(e)) {
        // Sigue la sesion en memoria (si el token aun vale); se reintenta.
        if (snapshot.status === "signedIn") schedule(RETRY_MS);
        return "transient";
      }
      dropSession();
      return "rejected";
    }
  }

  async function doRefresh(): Promise<RefreshOutcome> {
    try {
      const r = await withRefreshLock(attemptRefresh);
      if (r.ran) return r.value;
    } catch {
      /* lock no disponible: se trata como fallo transitorio */
    }
    if (snapshot.status === "signedIn") schedule(RETRY_MS);
    return "transient";
  }

  // Una sola peticion de refresh a la vez en esta pestana (y una a la vez entre
  // pestanas, por el lock).
  function refresh(): Promise<RefreshOutcome> {
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
      if (!channel) {
        channel = openChannel();
        if (channel) channel.onmessage = (ev) => onPeerMessage(ev.data);
      }
      if (!started) {
        started = (async () => {
          // Sin red al arrancar: reintenta con backoff antes de pedir PIN. Si el
          // servicio rechaza la sesion (401) se pide PIN de inmediato.
          for (let i = 0; snapshot.status === "loading"; i++) {
            const r = await refresh();
            if (r !== "transient" || snapshot.status !== "loading") break;
            const wait = startRetryDelays[i];
            if (wait === undefined) break;
            await sleep(wait);
          }
          // El refresh token se conserva y se reemplaza al iniciar sesion.
          if (snapshot.status === "loading") set({ status: "signedOut" });
        })();
      } else if (accessToken) {
        schedule();
      }
      return started;
    },
    stop() {
      clearTimer();
      if (channel) {
        channel.onmessage = null;
        channel.close();
        channel = null;
      }
    },

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
      // El refresh token vigente puede ser el que roto otra pestana.
      const rt = (storageUsable ? storedSession() : session)?.refreshToken ?? session?.refreshToken;
      const dt = device?.deviceToken;
      dropSession();
      broadcast({ t: "signout" });
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

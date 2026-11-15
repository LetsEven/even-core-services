import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalClient } from "./localClient";
import {
  DEVICE_KEY,
  REFRESH_MARGIN_MS,
  SESSION_KEY,
  createLocalAuth,
  type ChannelLike,
} from "./localSession";
import { jsonResponse, makeAccessToken, memoryStorage } from "./testUtils";

const BASE = "https://auth.test";
const DEVICE = { deviceToken: "dev-tok", branchId: "b1" };

function setup(opts: { storage?: Storage | null } = {}) {
  const fetchMock = vi.fn<typeof fetch>();
  const client = createLocalClient({ baseUrl: BASE, fetchImpl: fetchMock });
  const storage = opts.storage === undefined ? memoryStorage() : opts.storage;
  const auth = createLocalAuth({ client, storage });
  return { fetchMock, auth, storage };
}

const bodyOf = (call: unknown[]) =>
  JSON.parse(String((call[1] as RequestInit).body));
const headerOf = (call: unknown[], h: string) =>
  ((call[1] as RequestInit).headers as Record<string, string>)[h];

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
afterEach(() => vi.useRealTimers());

describe("emparejamiento", () => {
  it("pair guarda el token del dispositivo y la sucursal", async () => {
    const { auth, fetchMock, storage } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ deviceToken: "dev-tok", branchId: "b1" }));
    await auth.pair("  ABC-123 ");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/devices/pair`);
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ pairingCode: "ABC-123" });
    expect(auth.getSnapshot()).toMatchObject({ paired: true, branchId: "b1", status: "signedOut" });
    expect(JSON.parse(storage!.getItem(DEVICE_KEY)!)).toEqual(DEVICE);
  });

  it("codigo invalido: error y sigue sin emparejar", async () => {
    const { auth, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "x" }, 400));
    await expect(auth.pair("mal")).rejects.toMatchObject({ status: 400 });
    expect(auth.getSnapshot().paired).toBe(false);
  });

  it("listUsers usa el token del dispositivo y la sucursal", async () => {
    const { auth, fetchMock } = setup({ storage: memoryStorage({ [DEVICE_KEY]: JSON.stringify(DEVICE) }) });
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: [{ id: "u1", name: "Ana", role: "mesero" }] }));
    expect(await auth.listUsers()).toEqual([{ id: "u1", name: "Ana", role: "mesero" }]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/users?branchId=b1`);
    expect(headerOf(fetchMock.mock.calls[0], "X-Device-Token")).toBe("dev-tok");
    expect(headerOf(fetchMock.mock.calls[0], "Authorization")).toBeUndefined();
  });

  it("dispositivo revocado (401 en la lista) vuelve a pedir emparejamiento", async () => {
    const { auth, fetchMock, storage } = setup({ storage: memoryStorage({ [DEVICE_KEY]: JSON.stringify(DEVICE) }) });
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(auth.listUsers()).rejects.toMatchObject({ status: 401 });
    expect(auth.getSnapshot().paired).toBe(false);
    expect(storage!.getItem(DEVICE_KEY)).toBeNull();
  });
});

describe("login", () => {
  function paired() {
    return setup({ storage: memoryStorage({ [DEVICE_KEY]: JSON.stringify(DEVICE) }) });
  }

  it("login con PIN: usuario y permisos salen de los claims del JWT; refresh en localStorage, access solo en memoria", async () => {
    const { auth, fetchMock, storage } = paired();
    const access = makeAccessToken({
      sub: "u1",
      role: "cocina",
      permissions: ["cocina.ver", "cocina.operar"],
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: access, refreshToken: "r1", user: { id: "u1", name: "Luis", role: "cocina" } }),
    );
    await auth.login("u1", "1234");

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/login`);
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ userId: "u1", pin: "1234" });
    expect(headerOf(fetchMock.mock.calls[0], "X-Device-Token")).toBe("dev-tok");
    expect(headerOf(fetchMock.mock.calls[0], "Authorization")).toBeUndefined();

    const snap = auth.getSnapshot();
    expect(snap.status).toBe("signedIn");
    expect(snap.user).toEqual({
      id: "u1",
      name: "Luis",
      role: "cocina",
      permissions: ["cocina.ver", "cocina.operar"],
    });
    expect(await auth.getToken()).toBe(access);

    const stored = storage!.getItem(SESSION_KEY)!;
    expect(stored).toContain("r1");
    expect(stored).not.toContain(access);
    expect(storage!.getItem(DEVICE_KEY)).not.toContain(access);
    auth.stop();
  });

  it("PIN incorrecto: error, sigue signedOut y no guarda nada", async () => {
    const { auth, fetchMock, storage } = paired();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(auth.login("u1", "0000")).rejects.toMatchObject({ status: 401 });
    expect(auth.getSnapshot().status).toBe("signedOut");
    expect(storage!.getItem(SESSION_KEY)).toBeNull();
    expect(await auth.getToken()).toBeNull();
  });

  it("rate limit: 429 con Retry-After llega como error de bloqueo (el lockout por PIN es un 401 generico)", async () => {
    const { auth, fetchMock } = paired();
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "900" }));
    await expect(auth.login("u1", "0000")).rejects.toMatchObject({
      status: 429,
      retryAfter: 900,
      isLocked: true,
    });
  });

  it("sin red: error de red", async () => {
    const { auth, fetchMock } = paired();
    fetchMock.mockRejectedValueOnce(new TypeError("fail"));
    await expect(auth.login("u1", "1234")).rejects.toMatchObject({ status: 0, isNetwork: true });
  });

  it("access token sin claims validos se rechaza", async () => {
    const { auth, fetchMock } = paired();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: "no-es-jwt", refreshToken: "r", user: { id: "u", name: "A", role: "mesero" } }),
    );
    await expect(auth.login("u", "1234")).rejects.toMatchObject({ status: 502 });
    expect(auth.getSnapshot().status).toBe("signedOut");
  });
});

describe("refresh", () => {
  async function signedIn(expInMs = 15 * 60_000) {
    const ctx = setup({ storage: memoryStorage({ [DEVICE_KEY]: JSON.stringify(DEVICE) }) });
    const access = makeAccessToken({ sub: "u1", role: "mesero", expSec: Math.floor((Date.now() + expInMs) / 1000) });
    ctx.fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: access, refreshToken: "r1", user: { id: "u1", name: "Ana", role: "mesero" } }),
    );
    await ctx.auth.login("u1", "1234");
    return { ...ctx, access };
  }

  it("refresca solo antes de expirar y rota el refresh token", async () => {
    const { auth, fetchMock, storage, access } = await signedIn();
    const next = makeAccessToken({ sub: "u1", role: "mesero", expSec: Math.floor((Date.now() + 30 * 60_000) / 1000) });
    fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: next, refreshToken: "r2" }));

    await vi.advanceTimersByTimeAsync(15 * 60_000 - REFRESH_MARGIN_MS - 5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // aun no
    await vi.advanceTimersByTimeAsync(6_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/v1/refresh`);
    expect(bodyOf(fetchMock.mock.calls[1])).toEqual({ refreshToken: "r1" });
    expect(headerOf(fetchMock.mock.calls[1], "X-Device-Token")).toBe("dev-tok");
    expect(await auth.getToken()).toBe(next);
    expect(await auth.getToken()).not.toBe(access);
    expect(storage!.getItem(SESSION_KEY)).toContain("r2");
    expect(auth.getSnapshot().user?.name).toBe("Ana"); // conserva el nombre
    auth.stop();
  });

  it("getToken con el token por vencer refresca una sola vez aunque lo pidan varios a la vez", async () => {
    const { auth, fetchMock } = await signedIn(5_000);
    const next = makeAccessToken({ sub: "u1", role: "mesero", expSec: Math.floor((Date.now() + 15 * 60_000) / 1000) });
    fetchMock.mockResolvedValue(jsonResponse({ accessToken: next, refreshToken: "r2" }));
    const [a, b, c] = await Promise.all([auth.getToken(), auth.getToken(), auth.getToken()]);
    expect([a, b, c]).toEqual([next, next, next]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // login + 1 refresh
    auth.stop();
  });

  it("refresh rechazado (401) cierra la sesion y borra el refresh token", async () => {
    const { auth, fetchMock, storage } = await signedIn(5_000);
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    expect(await auth.getToken()).toBeNull();
    expect(auth.getSnapshot()).toMatchObject({ status: "signedOut", user: null, paired: true });
    expect(storage!.getItem(SESSION_KEY)).toBeNull();
  });

  it("fallo de red en el refresh no cierra la sesion y reintenta", async () => {
    const { auth, fetchMock } = await signedIn();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const next = makeAccessToken({ sub: "u1", role: "mesero", expSec: Math.floor((Date.now() + 40 * 60_000) / 1000) });
    fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: next, refreshToken: "r2" }));

    await vi.advanceTimersByTimeAsync(15 * 60_000 - REFRESH_MARGIN_MS + 1_000);
    expect(auth.getSnapshot().status).toBe("signedIn");
    await vi.advanceTimersByTimeAsync(16_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await auth.getToken()).toBe(next);
    auth.stop();
  });

  it("al arrancar con refresh token guardado restaura la sesion", async () => {
    const storage = memoryStorage({
      [DEVICE_KEY]: JSON.stringify(DEVICE),
      [SESSION_KEY]: JSON.stringify({ refreshToken: "r-old", name: "Ana" }),
    });
    const { auth, fetchMock } = setup({ storage });
    expect(auth.getSnapshot().status).toBe("loading");
    const next = makeAccessToken({ sub: "u1", role: "cajero", permissions: ["caja.ver"] });
    fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: next, refreshToken: "r-new" }));
    await auth.start();
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ refreshToken: "r-old" });
    expect(auth.getSnapshot()).toMatchObject({ status: "signedIn", user: { name: "Ana", role: "cajero", permissions: ["caja.ver"] } });
    auth.stop();
  });

  it("al arrancar con refresh token invalido pasa a signedOut", async () => {
    const storage = memoryStorage({
      [DEVICE_KEY]: JSON.stringify(DEVICE),
      [SESSION_KEY]: JSON.stringify({ refreshToken: "r-old", name: "Ana" }),
    });
    const { auth, fetchMock } = setup({ storage });
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    await auth.start();
    expect(auth.getSnapshot().status).toBe("signedOut");
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe("logout", () => {
  it("signOut revoca el refresh token en el servicio y limpia todo", async () => {
    const storage = memoryStorage({ [DEVICE_KEY]: JSON.stringify(DEVICE) });
    const { auth, fetchMock } = setup({ storage });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: makeAccessToken(), refreshToken: "r1", user: { id: "u1", name: "Ana", role: "mesero" } }),
    );
    await auth.login("u1", "1234");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await auth.signOut();

    const call = fetchMock.mock.calls[1];
    expect(call[0]).toBe(`${BASE}/v1/logout`);
    expect(headerOf(call, "X-Device-Token")).toBe("dev-tok");
    expect(bodyOf(call)).toEqual({ refreshToken: "r1" });
    expect(auth.getSnapshot()).toMatchObject({ status: "signedOut", user: null, paired: true });
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(storage.getItem(DEVICE_KEY)).not.toBeNull(); // sigue emparejado
    expect(await auth.getToken()).toBeNull();
    // Ya no hay timer de refresh.
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("si el servicio no responde, igual cierra la sesion local", async () => {
    const storage = memoryStorage({ [DEVICE_KEY]: JSON.stringify(DEVICE) });
    const { auth, fetchMock } = setup({ storage });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: makeAccessToken(), refreshToken: "r1", user: { id: "u1", name: "Ana", role: "mesero" } }),
    );
    await auth.login("u1", "1234");
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(auth.getSnapshot().status).toBe("signedOut");
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe("storage no disponible", () => {
  it("funciona en memoria si localStorage lanza excepciones", async () => {
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    } as unknown as Storage;
    const { auth, fetchMock } = setup({ storage: broken });
    fetchMock.mockResolvedValueOnce(jsonResponse({ deviceToken: "d", branchId: "b" }));
    await auth.pair("X");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: makeAccessToken(), refreshToken: "r1", user: { id: "u1", name: "Ana", role: "mesero" } }),
    );
    await auth.login("u1", "1234");
    expect(auth.getSnapshot().status).toBe("signedIn");
    await auth.signOut();
    expect(auth.getSnapshot().status).toBe("signedOut");
  });
});

const stored = (storage: Storage) => JSON.parse(storage.getItem(SESSION_KEY) ?? "null");
const tokenIn = (ms: number) =>
  makeAccessToken({ sub: "u1", role: "mesero", expSec: Math.floor((Date.now() + ms) / 1000) });

describe("restaurar sesion sin red", () => {
  function withStoredSession() {
    return memoryStorage({
      [DEVICE_KEY]: JSON.stringify(DEVICE),
      [SESSION_KEY]: JSON.stringify({ refreshToken: "r-old", name: "Ana" }),
    });
  }

  it("reintenta con backoff y restaura la sesion sin pedir PIN", async () => {
    const storage = withStoredSession();
    const { auth, fetchMock } = setup({ storage });
    fetchMock
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse({ accessToken: tokenIn(15 * 60_000), refreshToken: "r-new" }));
    const started = auth.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(auth.getSnapshot().status).toBe("loading");
    await vi.advanceTimersByTimeAsync(500); // 1er reintento
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.getSnapshot().status).toBe("loading");
    await vi.advanceTimersByTimeAsync(1_000); // 2do reintento
    await started;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(auth.getSnapshot().status).toBe("signedIn");
    // Todos los intentos reutilizan el mismo refresh token (nunca se rotó).
    expect(fetchMock.mock.calls.map((c) => bodyOf(c).refreshToken)).toEqual(["r-old", "r-old", "r-old"]);
    expect(stored(storage).refreshToken).toBe("r-new");
    auth.stop();
  });

  it("agota los reintentos: pide PIN pero conserva el refresh token", async () => {
    const storage = withStoredSession();
    const { auth, fetchMock } = setup({ storage });
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const started = auth.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await started;
    expect(fetchMock).toHaveBeenCalledTimes(6); // 1 + 5 reintentos
    expect(auth.getSnapshot().status).toBe("signedOut");
    expect(stored(storage).refreshToken).toBe("r-old");
  });

  it("un 5xx tambien se reintenta; un 401 no", async () => {
    const { auth, fetchMock } = setup({ storage: withStoredSession() });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 401));
    const started = auth.start();
    await vi.advanceTimersByTimeAsync(500);
    await started;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.getSnapshot().status).toBe("signedOut");
  });
});

describe("varias pestanas", () => {
  // Bus en memoria: lo que publica un canal lo reciben los demas.
  function bus() {
    const chans: (ChannelLike & { id: number })[] = [];
    return () => {
      const c: ChannelLike & { id: number } = {
        id: chans.length,
        onmessage: null,
        postMessage(m) {
          for (const o of chans) if (o !== c) o.onmessage?.({ data: m });
        },
        close() {
          chans.splice(chans.indexOf(c), 1);
        },
      };
      chans.push(c);
      return c;
    };
  }
  function tabs(storage: Storage, n = 2) {
    const channel = bus();
    return Array.from({ length: n }, () => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createLocalClient({ baseUrl: BASE, fetchImpl: fetchMock });
      return { fetchMock, auth: createLocalAuth({ client, storage, locks: null, channel }) };
    });
  }
  const seeded = (rt = "r1") =>
    memoryStorage({
      [DEVICE_KEY]: JSON.stringify(DEVICE),
      [SESSION_KEY]: JSON.stringify({ refreshToken: rt, name: "Ana" }),
    });

  it("dos pestanas que recargan a la vez: refrescan en serie con el token guardado, sin reuso", async () => {
    const storage = seeded("r1");
    const [a, b] = tabs(storage);
    let server = "r1"; // el servicio acepta solo el refresh vigente y rota
    let n = 1;
    const handler = async (_u: unknown, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)).refreshToken;
      if (sent !== server) return jsonResponse({}, 401);
      server = `r${++n}`;
      return jsonResponse({ accessToken: tokenIn(15 * 60_000), refreshToken: server });
    };
    a.fetchMock.mockImplementation(handler as typeof fetch);
    b.fetchMock.mockImplementation(handler as typeof fetch);

    const both = Promise.all([a.auth.start(), b.auth.start()]);
    await vi.advanceTimersByTimeAsync(1_000); // la segunda espera el lease de la primera
    await both;
    expect(a.auth.getSnapshot().status).toBe("signedIn");
    expect(b.auth.getSnapshot().status).toBe("signedIn");
    expect(stored(storage).refreshToken).toBe(server);
    expect(n).toBe(2); // una sola rotacion: la otra pestana adopto el token difundido
    a.auth.stop();
    b.auth.stop();
  });

  it("la pestana que rota difunde el access token y las demas lo adoptan sin llamar al servicio", async () => {
    const storage = seeded("r1");
    const [a, b] = tabs(storage);
    b.fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: tokenIn(15 * 60_000), refreshToken: "r2" }));
    await b.auth.start();
    a.fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: tokenIn(15 * 60_000), refreshToken: "r2" }));
    // A arranca con canal abierto pero B ya roto: A adopta el siguiente token de B.
    await a.auth.start();
    const bTok = tokenIn(30 * 60_000);
    b.fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: bTok, refreshToken: "r3" }));
    await vi.advanceTimersByTimeAsync(15 * 60_000 - REFRESH_MARGIN_MS + 1_000);
    // Quien dispare primero rota; la otra no llama al servicio con su token viejo.
    expect(await a.auth.getToken()).toBe(await b.auth.getToken());
    expect(stored(storage).refreshToken).toBe("r3");
    a.auth.stop();
    b.auth.stop();
  });

  it("cerrar sesion en una pestana cierra las demas y usa el refresh token vigente", async () => {
    const storage = seeded("r1");
    const [a, b] = tabs(storage);
    a.fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: tokenIn(15 * 60_000), refreshToken: "r2" }));
    await a.auth.start();
    b.fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: tokenIn(15 * 60_000), refreshToken: "r3" }));
    await b.auth.start();
    // A conserva r2 en memoria pero el guardado es r3 (lo roto B).
    a.fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await a.auth.signOut();
    expect(bodyOf(a.fetchMock.mock.calls[1])).toEqual({ refreshToken: "r3" });
    expect(b.auth.getSnapshot().status).toBe("signedOut");
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    a.auth.stop();
    b.auth.stop();
  });

  it("si otra pestana cerro sesion no se usa un refresh token revocado", async () => {
    const storage = seeded("r1");
    const [a] = tabs(storage);
    a.fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: tokenIn(5_000), refreshToken: "r2" }));
    await a.auth.start();
    storage.removeItem(SESSION_KEY); // cierre de sesion en otra pestana, sin canal
    expect(await a.auth.getToken()).toBeNull();
    expect(a.fetchMock).toHaveBeenCalledTimes(1);
    expect(a.auth.getSnapshot().status).toBe("signedOut");
    a.auth.stop();
  });

  it("sin Web Locks usa el lease: si otra pestana lo tiene no refresca y reintenta", async () => {
    const storage = seeded("r1");
    storage.setItem("crew_auth_refresh_lease", JSON.stringify({ owner: "otra", until: Date.now() + 60_000 }));
    const [a] = tabs(storage, 1);
    a.fetchMock.mockResolvedValue(jsonResponse({ accessToken: tokenIn(15 * 60_000), refreshToken: "r2" }));
    const started = a.auth.start();
    await vi.advanceTimersByTimeAsync(7_000);
    expect(a.fetchMock).not.toHaveBeenCalled();
    storage.removeItem("crew_auth_refresh_lease");
    await vi.advanceTimersByTimeAsync(2_000);
    await started;
    expect(a.auth.getSnapshot().status).toBe("signedIn");
    expect(storage.getItem("crew_auth_refresh_lease")).toBeNull();
    a.auth.stop();
  });

  it("con navigator.locks usa el lock exclusivo", async () => {
    const storage = seeded("r1");
    const names: string[] = [];
    const locks = {
      request: async <T,>(name: string, _o: unknown, cb: () => Promise<T>) => {
        names.push(name);
        return cb();
      },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ accessToken: tokenIn(15 * 60_000), refreshToken: "r2" }),
    );
    const auth = createLocalAuth({ client: createLocalClient({ baseUrl: BASE, fetchImpl: fetchMock }), storage, locks, channel: null });
    await auth.start();
    expect(names).toEqual(["crew-auth-refresh"]);
    expect(auth.getSnapshot().status).toBe("signedIn");
    auth.stop();
  });
});

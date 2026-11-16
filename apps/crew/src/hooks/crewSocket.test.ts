import { beforeEach, describe, expect, it, vi } from "vitest";

type Auth = (cb: (data: Record<string, unknown>) => void) => void;

class MockSocket {
  handlers = new Map<string, (...a: unknown[]) => void>();
  connect = vi.fn();
  disconnect = vi.fn();
  on(ev: string, fn: (...a: unknown[]) => void) {
    this.handlers.set(ev, fn);
    return this;
  }
  emitLocal(ev: string, ...a: unknown[]) {
    this.handlers.get(ev)?.(...a);
  }
}

const state = vi.hoisted(() => ({ socket: null as unknown, opts: null as unknown }));
vi.mock("socket.io-client", () => ({
  io: (_url: string, opts: unknown) => {
    state.opts = opts;
    return state.socket;
  },
}));

import { legacySecretFor, openCrewSocket } from "./crewSocket";

let sock: MockSocket;
const base = {
  url: "https://api.test",
  branchId: "b1",
  deviceId: "d1",
  platform: "web" as const,
};
const handshake = (): Promise<Record<string, unknown> | "none"> =>
  new Promise((resolve) => {
    (state.opts as { auth: Auth }).auth(resolve);
    setTimeout(() => resolve("none"), 20);
  });

beforeEach(() => {
  sock = new MockSocket();
  state.socket = sock;
});

describe("openCrewSocket", () => {
  it("envia auth.token con el token vigente", async () => {
    openCrewSocket({ ...base, kind: "clerk", getToken: async () => "tok1" });
    expect(await handshake()).toMatchObject({
      clientType: "crew",
      token: "tok1",
      branchId: "b1",
      deviceId: "d1",
      platform: "web",
    });
  });

  it("pide un token nuevo en cada reconexion", async () => {
    const getToken = vi.fn().mockResolvedValueOnce("t1").mockResolvedValueOnce("t2");
    openCrewSocket({ ...base, kind: "local", getToken });
    expect(await handshake()).toMatchObject({ token: "t1" });
    expect(await handshake()).toMatchObject({ token: "t2" });
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("auth_expired desconecta y reconecta con token nuevo", async () => {
    openCrewSocket({ ...base, kind: "local", getToken: async () => "t" });
    sock.emitLocal("auth_expired");
    expect(sock.disconnect).toHaveBeenCalledTimes(1);
    expect(sock.connect).toHaveBeenCalledTimes(1);
  });

  it("sin sesion cierra el socket y no envia handshake", async () => {
    openCrewSocket({ ...base, kind: "local", getToken: async () => null });
    expect(await handshake()).toBe("none");
    expect(sock.disconnect).toHaveBeenCalled();
  });

  it("stop cierra y evita reconectar tras auth_expired", () => {
    const { stop } = openCrewSocket({ ...base, kind: "local", getToken: async () => "t" });
    stop();
    sock.connect.mockClear();
    sock.emitLocal("auth_expired");
    expect(sock.connect).not.toHaveBeenCalled();
  });

  it("no manda secret en local ni aunque este definido", async () => {
    openCrewSocket({ ...base, kind: "local", getToken: async () => "t", legacySecret: "s" });
    expect(await handshake()).not.toHaveProperty("secret");
  });

  it("no manda secret en demo", async () => {
    openCrewSocket({ ...base, kind: "demo", getToken: async () => "t", legacySecret: "s" });
    expect(await handshake()).not.toHaveProperty("secret");
  });

  it("manda secret solo con clerk y variable definida", async () => {
    openCrewSocket({ ...base, kind: "clerk", getToken: async () => "t", legacySecret: "s" });
    expect(await handshake()).toMatchObject({ secret: "s", token: "t" });
    openCrewSocket({ ...base, kind: "clerk", getToken: async () => "t" });
    expect(await handshake()).not.toHaveProperty("secret");
  });
});

describe("legacySecretFor", () => {
  it("solo clerk con valor", () => {
    expect(legacySecretFor("clerk", "x")).toBe("x");
    expect(legacySecretFor("clerk", "")).toBeUndefined();
    expect(legacySecretFor("local", "x")).toBeUndefined();
    expect(legacySecretFor("demo", "x")).toBeUndefined();
  });
});

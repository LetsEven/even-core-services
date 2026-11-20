// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthService, type AuthServiceConfig } from "./service";

const base: AuthServiceConfig = {
  apiUrl: "http://api.test",
  termsSource: "demo",
  refreshSingleFlight: "refresh-token",
  retryProfileUpdateOnUnauthorized: false,
  clearExpiresAtOnLogout: false,
  clearSessionStorageKeys: ["pendingX"],
  clearLocalStorageKeys: ["even-guest-id"],
};

type Reply = { status: number; body: unknown };
function stubFetch(replies: Record<string, Reply[]>) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace("http://api.test", "");
      calls.push({ path, init });
      const queue = replies[path] ?? [{ status: 200, body: { success: true } }];
      const reply = queue.length > 1 ? queue.shift()! : queue[0];
      return {
        status: reply.status,
        ok: reply.status < 300,
        json: async () => reply.body,
      } as Response;
    }),
  );
  return calls;
}
const session = (n: string) => ({
  success: true,
  data: {
    session: { access_token: `A${n}`, refresh_token: `R${n}`, expires_at: 999 },
  },
});

describe("createAuthService", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("clearAllSessionData borra solo las claves configuradas", () => {
    const service = createAuthService(base);
    localStorage.setItem("even-guest-id", "g");
    localStorage.setItem("otra", "1");
    sessionStorage.setItem("pendingX", "1");
    sessionStorage.setItem("otra", "1");
    service.clearAllSessionData();
    expect(localStorage.getItem("even-guest-id")).toBeNull();
    expect(localStorage.getItem("otra")).toBe("1");
    expect(sessionStorage.getItem("pendingX")).toBeNull();
    expect(sessionStorage.getItem("otra")).toBe("1");
  });

  it("logout borra even_expires_at solo con clearExpiresAtOnLogout", async () => {
    for (const [flag, expected] of [
      [false, "9"],
      [true, null],
    ] as const) {
      stubFetch({});
      localStorage.setItem("even_access_token", "t");
      localStorage.setItem("even_expires_at", "9");
      await createAuthService({
        ...base,
        clearExpiresAtOnLogout: flag,
      }).logout();
      expect(localStorage.getItem("even_expires_at")).toBe(expected);
      expect(localStorage.getItem("even_access_token")).toBeNull();
    }
  });

  it("updateMyProfile reintenta con el token nuevo solo con retryProfileUpdateOnUnauthorized", async () => {
    for (const [flag, puts] of [
      [false, 1],
      [true, 2],
    ] as const) {
      localStorage.setItem("even_access_token", "viejo");
      localStorage.setItem("even_refresh_token", "r");
      const calls = stubFetch({
        "/profiles/me": [
          { status: 401, body: {} },
          { status: 200, body: { ok: 1 } },
        ],
        "/auth/refresh": [{ status: 200, body: session("1") }],
      });
      const response = await createAuthService({
        ...base,
        retryProfileUpdateOnUnauthorized: flag,
      }).updateMyProfile({
        firstName: "A",
      });
      expect(calls.filter((c) => c.path === "/profiles/me")).toHaveLength(puts);
      expect(response.success).toBe(flag);
    }
  });

  it("serializa refreshToken en paralelo (refresh-token) y no lo hace en handle-token-refresh", async () => {
    for (const [mode, refreshes] of [
      ["refresh-token", 1],
      ["handle-token-refresh", 2],
    ] as const) {
      localStorage.setItem("even_refresh_token", "r");
      const calls = stubFetch({
        "/auth/refresh": [{ status: 200, body: session("1") }],
      });
      const service = createAuthService({ ...base, refreshSingleFlight: mode });
      await Promise.all([service.refreshToken(), service.refreshToken()]);
      expect(calls.filter((c) => c.path === "/auth/refresh")).toHaveLength(
        refreshes,
      );
    }
  });

  it("refreshTimeoutMs manda una señal de aborto a /auth/refresh", async () => {
    localStorage.setItem("even_refresh_token", "r");
    const calls = stubFetch({
      "/auth/refresh": [{ status: 200, body: session("1") }],
    });
    await createAuthService({
      ...base,
      refreshTimeoutMs: 10_000,
    }).refreshToken();
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("manda el servicio y la sucursal con la aceptación de términos", async () => {
    localStorage.setItem("even_access_token", "t");
    const calls = stubFetch({ "/profiles": [{ status: 200, body: {} }] });
    const service = createAuthService(base);
    service.setRestaurantId(4);
    service.setBranchNumber(2);
    await service.createOrUpdateProfile({
      firstName: "A",
      lastName: "B",
      acceptedTerms: true,
    });
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      source: "demo",
      restaurantId: 4,
      branchNumber: 2,
    });
  });
});

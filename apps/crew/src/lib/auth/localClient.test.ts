import { afterEach, describe, expect, it, vi } from "vitest";
import { CrewAuthError, createLocalClient } from "./localClient";
import { jsonResponse } from "./testUtils";

afterEach(() => vi.useRealTimers());

describe("timeout del cliente local", () => {
  it("aborta con AbortController a los 15 s y lo reporta como error de red", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const client = createLocalClient({
      baseUrl: "https://auth.test",
      fetchImpl: ((_u: string, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        return new Promise(() => {});
      }) as unknown as typeof fetch,
    });
    const p = client.listUsers("dev", "b1").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(signal?.aborted).toBe(true);
    const e = await p;
    expect(e).toBeInstanceOf(CrewAuthError);
    expect((e as CrewAuthError).isNetwork).toBe(true);
  });

  it("vence aunque fetch ignore la senal y tambien si el cuerpo se cuelga", async () => {
    vi.useFakeTimers();
    const hung = { ok: true, status: 200, headers: new Headers(), json: () => new Promise(() => {}) };
    const client = createLocalClient({
      baseUrl: "https://auth.test",
      timeoutMs: 1000,
      fetchImpl: (async () => hung) as unknown as typeof fetch,
    });
    const p = client.logout("dev", "rt").then(() => "ok");
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toBe("ok"); // cuerpo ilegible = null; no se cuelga
  });

  it("una respuesta normal no se ve afectada y el timer se limpia", async () => {
    const client = createLocalClient({
      baseUrl: "https://auth.test",
      fetchImpl: (async () => jsonResponse({ users: [{ id: "u", name: "A", role: "mesero" }] })) as unknown as typeof fetch,
    });
    expect(await client.listUsers("dev", "b1")).toHaveLength(1);
  });
});

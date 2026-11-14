import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateResources,
  isResourceFresh,
  loadResource,
  peekResource,
  prefetchResource,
} from "./resourceCache";

describe("resourceCache", () => {
  beforeEach(() => {
    invalidateResources();
    vi.useRealTimers();
  });

  it("reutiliza el valor fresco sin volver a pedirlo", async () => {
    const fetcher = vi.fn().mockResolvedValue("a");
    await loadResource("k", fetcher);
    await loadResource("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekResource("k")).toBe("a");
  });

  it("comparte la petición en vuelo", async () => {
    const fetcher = vi.fn().mockResolvedValue("a");
    await Promise.all([loadResource("k", fetcher), loadResource("k", fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("vuelve a pedir al vencer el ttl pero conserva el valor viejo", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    await loadResource("k", fetcher, { ttlMs: 1000 });
    vi.advanceTimersByTime(1500);
    expect(isResourceFresh("k", 1000)).toBe(false);
    expect(peekResource("k")).toBe("a");
    await loadResource("k", fetcher, { ttlMs: 1000 });
    expect(peekResource("k")).toBe("b");
  });

  it("no guarda errores", async () => {
    await expect(loadResource("k", () => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(peekResource("k")).toBeUndefined();
    const ok = vi.fn().mockResolvedValue("a");
    await loadResource("k", ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("prefetch no lanza y invalidate por prefijo borra", async () => {
    prefetchResource("p:1", () => Promise.reject(new Error("x")));
    await loadResource("p:2", () => Promise.resolve(1));
    await loadResource("q:1", () => Promise.resolve(2));
    invalidateResources("p:");
    expect(peekResource("p:2")).toBeUndefined();
    expect(peekResource("q:1")).toBe(2);
  });
});

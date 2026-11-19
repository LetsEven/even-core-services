// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FingerprintInput } from "./idempotency";
import { clearCachedWalletOrder, getOrCreateWalletOrderId } from "./wallet-order-cache";

const cart: FingerprintInput = { items: [{ menuItemId: "a", quantity: 1 }], total: 100 } as FingerprintInput;

beforeEach(() => sessionStorage.clear());

describe("getOrCreateWalletOrderId", () => {
  it("reutiliza la orden si el carrito no cambió", async () => {
    const create = vi.fn().mockResolvedValue("order-1");
    expect(await getOrCreateWalletOrderId("apple", cart, create)).toBe("order-1");
    expect(await getOrCreateWalletOrderId("apple", cart, create)).toBe("order-1");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("crea otra si el carrito cambió", async () => {
    const create = vi.fn().mockResolvedValueOnce("order-1").mockResolvedValueOnce("order-2");
    await getOrCreateWalletOrderId("apple", cart, create);
    expect(await getOrCreateWalletOrderId("apple", { ...cart, total: 150 }, create)).toBe("order-2");
  });

  it("apple y google no comparten caché y clear solo borra la suya", async () => {
    const create = vi.fn().mockResolvedValueOnce("A").mockResolvedValueOnce("G").mockResolvedValueOnce("A2");
    await getOrCreateWalletOrderId("apple", cart, create);
    await getOrCreateWalletOrderId("google", cart, create);
    clearCachedWalletOrder("apple");
    expect(await getOrCreateWalletOrderId("google", cart, create)).toBe("G");
    expect(await getOrCreateWalletOrderId("apple", cart, create)).toBe("A2");
  });

  it("no cachea si create no devuelve orden", async () => {
    const create = vi.fn().mockResolvedValue(null);
    await getOrCreateWalletOrderId("apple", cart, create);
    await getOrCreateWalletOrderId("apple", cart, create);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

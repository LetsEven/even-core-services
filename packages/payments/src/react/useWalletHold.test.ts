// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWalletHold, WALLET_HOLD_EXPIRY_MS } from "./useWalletHold";

describe("useWalletHold", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("vence tras ~170 s con la orden apartada y sin pagar", () => {
    const onExpired = vi.fn();
    const { result } = renderHook(() =>
      useWalletHold({ accountId: "t1", release: vi.fn(), onExpired }),
    );
    act(() => result.current.markHeld());
    act(() => vi.advanceTimersByTime(WALLET_HOLD_EXPIRY_MS + 5000));
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(result.current.expired).toBe(true);
  });

  it("no vence si ya se pagó", () => {
    const onExpired = vi.fn();
    const { result } = renderHook(() =>
      useWalletHold({ accountId: "t1", release: vi.fn(), onExpired }),
    );
    act(() => {
      result.current.markHeld();
      result.current.markPaid();
    });
    act(() => vi.advanceTimersByTime(WALLET_HOLD_EXPIRY_MS * 2));
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("suelta el apartado al salir de la pantalla sin pagar", () => {
    const release = vi.fn();
    const { result, unmount } = renderHook(() =>
      useWalletHold({ accountId: "t1", release, onExpired: vi.fn() }),
    );
    act(() => result.current.markHeld());
    unmount();
    expect(release).toHaveBeenCalledWith("t1");
  });

  it("sin apartado no suelta nada", () => {
    const release = vi.fn();
    const { unmount } = renderHook(() =>
      useWalletHold({ accountId: "t1", release, onExpired: vi.fn() }),
    );
    unmount();
    expect(release).not.toHaveBeenCalled();
  });
});

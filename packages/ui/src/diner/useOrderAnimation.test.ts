import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderAnimation } from "./useOrderAnimation";

describe("useOrderAnimation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (over: Partial<Parameters<typeof useOrderAnimation>[0]> = {}) => {
    const cbs = { onConfirm: vi.fn(), onContinue: vi.fn(), onTimeout: vi.fn(), fallbackContinue: vi.fn() };
    const hook = renderHook((props: { confirmed: boolean }) => useOrderAnimation({ ...cbs, ...over, ...props }), {
      initialProps: { confirmed: false },
    });
    return { cbs, ...hook };
  };

  it("recorre circle -> content -> greenCircle y confirma tras el tiempo de cancelación", () => {
    const { result, cbs } = setup();
    expect(result.current.animationState).toBe("circle");
    act(() => void vi.advanceTimersByTime(1500));
    expect(result.current.animationState).toBe("content");
    expect(result.current.showCancelButton).toBe(true);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current.logoColorful).toBe(true);
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.showCancelButton).toBe(false);
    expect(cbs.onConfirm).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(1500));
    expect(result.current.animationState).toBe("greenCircle");
  });

  it("espera a la confirmación real antes de mostrar el éxito y navegar", () => {
    const { result, rerender, cbs } = setup();
    act(() => void vi.advanceTimersByTime(5500));
    expect(result.current.animationState).toBe("greenCircle");
    act(() => void vi.advanceTimersByTime(10000));
    expect(result.current.animationState).toBe("greenCircle");
    expect(cbs.onContinue).not.toHaveBeenCalled();

    rerender({ confirmed: true });
    act(() => void vi.advanceTimersByTime(1500));
    expect(result.current.animationState).toBe("success");
    act(() => void vi.advanceTimersByTime(1800));
    expect(cbs.onContinue).toHaveBeenCalledTimes(1);
    expect(cbs.fallbackContinue).not.toHaveBeenCalled();
    expect(cbs.onTimeout).not.toHaveBeenCalled();
  });

  it("llama onTimeout si la confirmación no llega en 20 s", () => {
    const { cbs } = setup();
    act(() => void vi.advanceTimersByTime(5500));
    act(() => void vi.advanceTimersByTime(20000));
    expect(cbs.onTimeout).toHaveBeenCalledTimes(1);
  });

  it("usa fallbackContinue si no hay onContinue/onTimeout", () => {
    const { cbs } = setup({ onContinue: undefined, onTimeout: undefined });
    act(() => void vi.advanceTimersByTime(5500));
    act(() => void vi.advanceTimersByTime(20000));
    expect(cbs.fallbackContinue).toHaveBeenCalledTimes(1);
  });

  it("bloquea el body solo con lockBody y lo restaura al desmontar", () => {
    document.body.style.position = "";
    const { unmount } = setup({ lockBody: true });
    expect(document.body.style.position).toBe("fixed");
    unmount();
    expect(document.body.style.position).toBe("");
    const { unmount: u2 } = setup();
    expect(document.body.style.position).toBe("");
    u2();
  });
});

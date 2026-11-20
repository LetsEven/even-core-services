// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";

afterEach(cleanup);
import {
  DISMISS_DISTANCE,
  dragOffset,
  shouldDismiss,
  usePullToDismiss,
} from "./usePullToDismiss";

describe("dragOffset / shouldDismiss", () => {
  it("no baja hacia arriba y frena después de 80px", () => {
    expect(dragOffset(-20)).toBe(0);
    expect(dragOffset(50)).toBe(50);
    expect(dragOffset(180)).toBeLessThan(180);
  });
  it("cierra por distancia o por flick", () => {
    expect(shouldDismiss(DISMISS_DISTANCE, 0)).toBe(true);
    expect(shouldDismiss(60, 0.1)).toBe(false);
    expect(shouldDismiss(60, 1)).toBe(true);
    expect(shouldDismiss(10, 2)).toBe(false);
  });
});

function Card({ onDismiss, enabled = true }: { onDismiss: () => void; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  usePullToDismiss(ref, [ref], onDismiss, enabled);
  return <div ref={ref} data-testid="card" />;
}

const touch = (y: number, x = 0) => ({ touches: [{ clientX: x, clientY: y }] });

function pull(el: HTMLElement, to: number, x = 0) {
  fireEvent.touchStart(el, touch(0));
  fireEvent.touchMove(el, touch(20, x));
  fireEvent.touchMove(el, touch(to, x));
  fireEvent.touchEnd(el, { touches: [] });
}

describe("usePullToDismiss", () => {
  it("cierra al jalar lo suficiente hacia abajo", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Card onDismiss={onDismiss} />);
    pull(getByTestId("card"), 300);
    vi.runAllTimers();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("no cierra con un jalón corto, ni hacia arriba, ni deshabilitado", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { getByTestId, rerender } = render(<Card onDismiss={onDismiss} />);
    const el = getByTestId("card");
    fireEvent.touchStart(el, touch(0));
    fireEvent.touchMove(el, touch(20));
    fireEvent.touchMove(el, touch(60));
    // Se queda quieto antes de soltar: sin flick
    fireEvent.touchEnd(el, { touches: [] });
    pull(el, -300);
    rerender(<Card onDismiss={onDismiss} enabled={false} />);
    pull(getByTestId("card"), 300);
    vi.runAllTimers();
    expect(onDismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

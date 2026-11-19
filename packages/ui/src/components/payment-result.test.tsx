import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentResult } from "./payment-result";

const TIMING = { introMs: 10, cancelWindowMs: 20, settleMs: 10, greenMs: 10, successMs: 10, timeoutMs: 100 };

describe("PaymentResult", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (props: Partial<Parameters<typeof PaymentResult>[0]> = {}) => {
    const onConfirm = vi.fn();
    const onContinue = vi.fn();
    const onTimeout = vi.fn();
    const view = render(
      <PaymentResult
        confirmed={false}
        title="Procesando"
        successMessage="Listo"
        timing={TIMING}
        onConfirm={onConfirm}
        onContinue={onContinue}
        onTimeout={onTimeout}
        {...props}
      />,
    );
    return { onConfirm, onContinue, onTimeout, ...view };
  };

  it("cobra al terminar la ventana de cancelar y espera la confirmación real para el check", () => {
    const { onConfirm, onContinue, rerender } = setup();
    act(() => vi.advanceTimersByTime(10));
    expect(screen.getByText("Procesando")).toBeTruthy();
    act(() => vi.advanceTimersByTime(20));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(30));
    expect(screen.queryByText("Listo")).toBeNull(); // aún sin confirmar

    rerender(
      <PaymentResult confirmed title="Procesando" successMessage="Listo" timing={TIMING} onContinue={onContinue} />,
    );
    act(() => vi.advanceTimersByTime(10));
    expect(screen.getByText("Listo")).toBeTruthy();
    act(() => vi.advanceTimersByTime(10));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("cancelWindowMs 0 cobra justo al terminar el círculo inicial", () => {
    const { onConfirm } = setup({ timing: { ...TIMING, cancelWindowMs: 0 } });
    act(() => vi.advanceTimersByTime(10));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("llama onTimeout si la confirmación nunca llega", () => {
    const { onTimeout, onContinue } = setup();
    act(() => vi.advanceTimersByTime(40)); // llega al círculo verde
    act(() => vi.advanceTimersByTime(100));
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("solo muestra cancelar si hay onCancel", () => {
    const onCancel = vi.fn();
    setup({ onCancel, cancelLabel: "Deshacer" });
    act(() => vi.advanceTimersByTime(10));
    expect(screen.getByText("Deshacer")).toBeTruthy();
  });
});

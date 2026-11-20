// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSavedCardCharge } from "./useSavedCardCharge";

describe("useSavedCardCharge", () => {
  it("devuelve callbacks estables que usan las opciones del último render", async () => {
    const first = vi.fn().mockResolvedValue({ success: true, data: { order: { id: "a" } } });
    const second = vi.fn().mockResolvedValue({ success: true, data: { order: { id: "b" } } });
    const paymentService = { processPayment: vi.fn(), getPaymentIntentStatus: vi.fn() };
    const { result, rerender } = renderHook(
      ({ confirm }) => useSavedCardCharge({ paymentService, confirm }),
      { initialProps: { confirm: first } },
    );
    const initial = result.current;

    rerender({ confirm: second });

    expect(result.current).toBe(initial);
    expect(await result.current.confirm(() => ({}))).toEqual({ success: true, order: { id: "b" } });
    expect(first).not.toHaveBeenCalled();
  });
});

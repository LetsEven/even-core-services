import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_PEOPLE,
  MIN_PEOPLE,
  RING_CIRCUMFERENCE,
  isValidTipInput,
  ringSegments,
  useEqualSplit,
  useSplitRing,
} from "./useEqualSplit";

describe("ringSegments", () => {
  it("reparte el anillo en partes iguales con tu segmento al inicio", () => {
    const { slice, yours, rest } = ringSegments(4);
    expect(slice).toBeCloseTo(RING_CIRCUMFERENCE / 4);
    expect(yours).toEqual({ start: 0, length: slice });
    expect(rest).toHaveLength(3);
    expect(rest[0].start).toBeCloseTo(slice);
  });

  it("añade un segmento parcial con un número fraccionario de personas", () => {
    const { slice, rest } = ringSegments(2.5);
    expect(rest).toHaveLength(2);
    expect(rest[1].length).toBeCloseTo(RING_CIRCUMFERENCE - 2 * slice);
  });
});

describe("useEqualSplit", () => {
  it("respeta el mínimo y el máximo de personas", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ p }) => useEqualSplit({ people: p, onPeopleChange: onChange }), {
      initialProps: { p: MIN_PEOPLE },
    });
    expect(result.current.canDecrement).toBe(false);
    act(() => result.current.decrement());
    expect(onChange).toHaveBeenLastCalledWith(MIN_PEOPLE);
    act(() => result.current.increment());
    expect(onChange).toHaveBeenLastCalledWith(MIN_PEOPLE + 1);

    rerender({ p: MAX_PEOPLE });
    expect(result.current.canIncrement).toBe(false);
    act(() => result.current.increment());
    expect(onChange).toHaveBeenLastCalledWith(MAX_PEOPLE);
  });

  it("ofrece los porcentajes de propina rápidos", () => {
    const { result } = renderHook(() => useEqualSplit({ people: 3, onPeopleChange: () => {} }));
    expect(result.current.tipOptions).toEqual([0, 10, 15, 20]);
  });
});

describe("useSplitRing", () => {
  it("limita el anillo a 15 segmentos", () => {
    const { result } = renderHook(() => useSplitRing(40));
    expect(result.current.slice).toBeCloseTo(RING_CIRCUMFERENCE / 15);
  });
});

describe("isValidTipInput", () => {
  it.each([["", true], ["12", true], ["12.5", true], [".5", true], ["1.2.3", false], ["abc", false], ["-3", false]])(
    "%j -> %s",
    (value, ok) => expect(isValidTipInput(value)).toBe(ok),
  );
});

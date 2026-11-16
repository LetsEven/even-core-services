// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { comandaStorageKey, useComandaCart } from "./useComandaCart";
import type { ComandaLine } from "./types";

const KEY = comandaStorageKey(1, 2, "5");

const taco = (over: Partial<Omit<ComandaLine, "key">> = {}) => ({
  menuItemId: 10,
  name: "Taco",
  quantity: 1,
  unitPrice: 50,
  extraPrice: 0,
  customFields: [],
  specialInstructions: null,
  ...over,
});

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe("useComandaCart", () => {
  it("calcula conteo y total con extras", () => {
    const { result } = renderHook(() => useComandaCart(KEY));
    act(() => {
      result.current.addLine(taco({ quantity: 2, extraPrice: 10 }));
      result.current.addLine(taco({ menuItemId: 11, name: "Agua", unitPrice: 25 }));
    });
    expect(result.current.count).toBe(3);
    expect(result.current.total).toBe(145);
    expect(result.current.quantityOf(10)).toBe(2);
  });

  it("fusiona líneas idénticas y separa las distintas", () => {
    const { result } = renderHook(() => useComandaCart(KEY));
    act(() => {
      result.current.addLine(taco());
      result.current.addLine(taco());
      result.current.addLine(taco({ specialInstructions: "sin cebolla" }));
    });
    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines[0].quantity).toBe(2);
  });

  it("quita líneas y decrementa por platillo", () => {
    const { result } = renderHook(() => useComandaCart(KEY));
    act(() => result.current.addLine(taco({ quantity: 2 })));
    act(() => result.current.decrementItem(10));
    expect(result.current.quantityOf(10)).toBe(1);
    act(() => result.current.decrementItem(10));
    expect(result.current.lines).toHaveLength(0);
    act(() => result.current.addLine(taco()));
    act(() => result.current.removeLine(result.current.lines[0].key));
    expect(result.current.count).toBe(0);
  });

  it("persiste en sessionStorage por mesa", () => {
    const first = renderHook(() => useComandaCart(KEY));
    act(() => {
      first.result.current.addLine(taco());
      first.result.current.setNotes("alergia a nueces");
    });
    first.unmount();
    const again = renderHook(() => useComandaCart(KEY));
    expect(again.result.current.count).toBe(1);
    expect(again.result.current.notes).toBe("alergia a nueces");
    const other = renderHook(() => useComandaCart(comandaStorageKey(1, 2, "6")));
    expect(other.result.current.count).toBe(0);
  });

  it("clear vacía y limpia el storage; tolera JSON corrupto", () => {
    sessionStorage.setItem(KEY, "{no es json");
    const { result } = renderHook(() => useComandaCart(KEY));
    expect(result.current.lines).toEqual([]);
    act(() => result.current.addLine(taco()));
    act(() => result.current.clear());
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

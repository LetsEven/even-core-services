import { useCallback, useEffect, useMemo, useState } from "react";
import { linesDisplayTotal } from "./pricing";
import type { ComandaLine } from "./types";

interface Persisted {
  lines: ComandaLine[];
  notes: string;
}

export function comandaStorageKey(
  restaurantId: number,
  branchNumber: number,
  unit: string,
): string {
  return `comanda:${restaurantId}:${branchNumber}:${unit}`;
}

function load(key: string): Persisted {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { lines: [], notes: "" };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };
  } catch {
    return { lines: [], notes: "" };
  }
}

function save(key: string, data: Persisted) {
  try {
    if (data.lines.length === 0 && !data.notes) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // sessionStorage no disponible: el carrito vive solo en memoria.
  }
}

let seq = 0;
const newKey = (menuItemId: number) =>
  `${menuItemId}-${Date.now().toString(36)}-${seq++}`;

// Dos líneas se fusionan si piden exactamente lo mismo.
function sameLine(a: ComandaLine, b: Omit<ComandaLine, "key">): boolean {
  return (
    a.menuItemId === b.menuItemId &&
    a.specialInstructions === b.specialInstructions &&
    JSON.stringify(a.customFields) === JSON.stringify(b.customFields)
  );
}

export function useComandaCart(storageKey: string) {
  const [state, setState] = useState<{ key: string; data: Persisted }>(() => ({
    key: storageKey,
    data: load(storageKey),
  }));

  // Cambió la mesa: recarga el borrador de esa mesa.
  let current = state;
  if (state.key !== storageKey) {
    current = { key: storageKey, data: load(storageKey) };
    setState(current);
  }
  const { lines, notes } = current.data;

  useEffect(() => {
    save(current.key, current.data);
  }, [current]);

  const update = useCallback(
    (fn: (d: Persisted) => Persisted) =>
      setState((s) => ({ key: s.key, data: fn(s.data) })),
    [],
  );

  const addLine = useCallback(
    (line: Omit<ComandaLine, "key">) =>
      update((d) => {
        const idx = d.lines.findIndex((l) => sameLine(l, line));
        if (idx >= 0) {
          const next = [...d.lines];
          next[idx] = {
            ...next[idx],
            quantity: next[idx].quantity + line.quantity,
          };
          return { ...d, lines: next };
        }
        return {
          ...d,
          lines: [...d.lines, { ...line, key: newKey(line.menuItemId) }],
        };
      }),
    [update],
  );

  const setQuantity = useCallback(
    (key: string, quantity: number) =>
      update((d) => ({
        ...d,
        lines:
          quantity <= 0
            ? d.lines.filter((l) => l.key !== key)
            : d.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
      })),
    [update],
  );

  const removeLine = useCallback(
    (key: string) => setQuantity(key, 0),
    [setQuantity],
  );

  // Quita una unidad del último renglón de ese platillo (stepper del menú).
  const decrementItem = useCallback(
    (menuItemId: number) =>
      update((d) => {
        const idx = d.lines.map((l) => l.menuItemId).lastIndexOf(menuItemId);
        if (idx < 0) return d;
        const line = d.lines[idx];
        const lines =
          line.quantity <= 1
            ? d.lines.filter((_, i) => i !== idx)
            : d.lines.map((l, i) =>
                i === idx ? { ...l, quantity: l.quantity - 1 } : l,
              );
        return { ...d, lines };
      }),
    [update],
  );

  const incrementItem = useCallback(
    (menuItemId: number) =>
      update((d) => {
        const idx = d.lines.map((l) => l.menuItemId).lastIndexOf(menuItemId);
        if (idx < 0) return d;
        return {
          ...d,
          lines: d.lines.map((l, i) =>
            i === idx ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        };
      }),
    [update],
  );

  const setNotes = useCallback(
    (value: string) => update((d) => ({ ...d, notes: value })),
    [update],
  );

  const clear = useCallback(
    () => update(() => ({ lines: [], notes: "" })),
    [update],
  );

  const count = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  );
  const total = useMemo(() => linesDisplayTotal(lines), [lines]);
  const quantityOf = useCallback(
    (menuItemId: number) =>
      lines
        .filter((l) => l.menuItemId === menuItemId)
        .reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  );

  return {
    lines,
    notes,
    count,
    total,
    quantityOf,
    addLine,
    setQuantity,
    removeLine,
    incrementItem,
    decrementItem,
    setNotes,
    clear,
  };
}

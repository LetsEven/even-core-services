import { useCallback, useState } from "react";

// "Visto/no visto" es local por dispositivo (localStorage), sin sincronizar
// entre los distintos crew devices de una sucursal — decisión tomada para
// esta primera versión del croquis de mesas/habitaciones.

function storageKey(branchId: string) {
  return `crew_seen_orders_${branchId}`;
}

function loadSeenIds(branchId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(branchId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function persistSeenIds(branchId: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(branchId), JSON.stringify([...ids]));
  } catch {
    // silently fail
  }
}

export function useUnseenOrders(branchId: string | null) {
  const [seenIds, setSeenIds] = useState<Set<string>>(() =>
    branchId ? loadSeenIds(branchId) : new Set(),
  );
  // Recarga desde localStorage al cambiar de sucursal, ajustando el estado
  // durante el render (patrón recomendado por React en vez de un efecto) —
  // evita el render extra de un useEffect + setState.
  const [prevBranchId, setPrevBranchId] = useState(branchId);
  if (branchId !== prevBranchId) {
    setPrevBranchId(branchId);
    setSeenIds(branchId ? loadSeenIds(branchId) : new Set());
  }

  const isUnseen = useCallback(
    (orderId: string) => !seenIds.has(orderId),
    [seenIds],
  );

  const markSeen = useCallback(
    (orderId: string) => {
      if (!branchId || seenIds.has(orderId)) return;
      setSeenIds((prev) => {
        const next = new Set(prev);
        next.add(orderId);
        persistSeenIds(branchId, next);
        return next;
      });
    },
    [branchId, seenIds],
  );

  // Limpia ids de órdenes que ya no están activas, para que el set en
  // localStorage no crezca sin límite con órdenes cerradas hace tiempo.
  const pruneTo = useCallback(
    (activeOrderIds: string[]) => {
      if (!branchId) return;
      setSeenIds((prev) => {
        const activeSet = new Set(activeOrderIds);
        const next = new Set([...prev].filter((id) => activeSet.has(id)));
        if (next.size === prev.size) return prev;
        persistSeenIds(branchId, next);
        return next;
      });
    },
    [branchId],
  );

  return { isUnseen, markSeen, pruneTo };
}

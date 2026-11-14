import { useEffect, useState } from "react";
import type { ActiveOrderData } from "../services/pickandgo.service";

/**
 * Avance del pedido de 0 a 1 para barras y anillos.
 * Preparando avanza con el tiempo estimado (sin pasar de 0.6), listo = 0.8, entregado = 1.
 */
export function orderProgress(order: ActiveOrderData, now: number): number {
  const o = order.pick_and_go_order;
  if (!o) return 0;
  if (o.cooking_status === "delivered") return 1;
  if (o.cooking_status === "ready") return 0.8;
  const total = (o.prep_time_minutes ?? 15) * 60_000;
  const elapsed = now - new Date(o.created_at).getTime();
  const frac = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;
  return 0.08 + 0.52 * frac;
}

/** Hora actual que se refresca cada `ms` solo mientras `enabled`. */
export function useNow(enabled: boolean, ms = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [enabled, ms]);
  return now;
}

/** Progreso global: el del pedido más atrasado, o null si no hay pedidos. */
export function overallProgress(
  orders: ActiveOrderData[],
  now: number,
): number | null {
  if (orders.length === 0) return null;
  return Math.min(...orders.map((o) => orderProgress(o, now)));
}

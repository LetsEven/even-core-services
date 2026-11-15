import type { CookingStatus, Order } from "../../types";

export type Column = CookingStatus;

/** Minutos de preparación asumidos cuando la orden no trae `prepTimeMinutes`. */
const DEFAULT_PREP_MINUTES = 20;

/** En qué columna cae una orden. Pick & Go usa su estado de cocina; el resto se deriva de sus platillos. */
export function getOrderColumn(order: Order): Column {
  if (order.orderType === "pick_and_go" && order.cookingStatus) {
    return order.cookingStatus;
  }
  const dishes = order.dishes;
  if (dishes.length > 0 && dishes.every((d) => d.status === "delivered")) {
    return "delivered";
  }
  if (dishes.length > 0 && dishes.every((d) => d.status !== "preparing")) {
    return "ready";
  }
  return "preparing";
}

export function elapsedMinutes(order: Order, now: number): number {
  return Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60_000));
}

export function isOrderLate(order: Order, now: number): boolean {
  if (getOrderColumn(order) !== "preparing") return false;
  const limit =
    (order.prepTimeMinutes ?? DEFAULT_PREP_MINUTES) +
    (order.waiterExtraMinutes ?? 0);
  return elapsedMinutes(order, now) > limit;
}

export function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}


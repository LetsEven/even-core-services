import type { Dish, Order } from "../../types";

/** Minutos de preparación asumidos cuando la orden no trae `prepTimeMinutes`. */
const DEFAULT_PREP_MINUTES = 20;

/** Columnas de Cocina: la unidad es el platillo, no el pedido. */
export type DishColumn = "preparing" | "ready";

export interface DishTicket {
  /** Clave estable para React: pedido + platillo. */
  key: string;
  order: Order;
  dish: Dish;
}

/** Hora en que se pidió el platillo; si no viene, la de la cuenta. */
export function dishStartedAt(order: Order, dish: Dish): number {
  return new Date(dish.createdAt ?? order.createdAt).getTime();
}

/** Columna de un platillo, o null si ya se entregó (Cocina no lo muestra). */
export function getDishColumn(dish: Dish): DishColumn | null {
  if (dish.status === "delivered") return null;
  return dish.status === "ready" ? "ready" : "preparing";
}

/** Platillos de todos los pedidos, agrupados por columna y del más antiguo al más nuevo. */
export function groupDishTickets(
  orders: Order[],
): Record<DishColumn, DishTicket[]> {
  const g: Record<DishColumn, DishTicket[]> = { preparing: [], ready: [] };
  for (const order of orders) {
    for (const dish of order.dishes) {
      const col = getDishColumn(dish);
      if (col) g[col].push({ key: `${order.id}:${dish.id}`, order, dish });
    }
  }
  for (const col of Object.keys(g) as DishColumn[]) {
    // Más antiguos primero (es lo que la cocina debe atender antes); a igual
    // hora de pedido se conserva el orden de los platillos dentro del pedido.
    g[col].sort(
      (a, b) => dishStartedAt(a.order, a.dish) - dishStartedAt(b.order, b.dish),
    );
  }
  return g;
}

export interface OrderProgress {
  /** En cocina todavía. */
  preparing: number;
  /** Listos en barra, sin entregar. */
  ready: number;
  /** Por entregar en total (preparando + listos); los ya entregados no cuentan. */
  pending: number;
  /** Todo lo pendiente ya salió de cocina y hay algo por entregar: el pedido está completo. */
  complete: boolean;
  /** Parte salió y parte sigue en cocina (ej. 3 de 4). */
  partial: boolean;
}

/** Avance de un pedido según sus platillos; lo usan Mesas y Pick & Go. */
export function getOrderProgress(order: Order): OrderProgress {
  const preparing = order.dishes.filter((d) => d.status === "preparing").length;
  const ready = order.dishes.filter((d) => d.status === "ready").length;
  return {
    preparing,
    ready,
    pending: preparing + ready,
    complete: preparing === 0 && ready > 0,
    partial: preparing > 0 && ready > 0,
  };
}

/** Un platillo va tarde si sigue preparándose y su pedido ya pasó el tiempo de preparación. */
export function isDishLate(order: Order, dish: Dish, now: number): boolean {
  if (getDishColumn(dish) !== "preparing") return false;
  const limit =
    (order.prepTimeMinutes ?? DEFAULT_PREP_MINUTES) +
    (order.waiterExtraMinutes ?? 0);
  return dishElapsedMinutes(order, dish, now) > limit;
}

/** Minutos desde que se pidió este platillo (no desde que se abrió la cuenta). */
export function dishElapsedMinutes(
  order: Order,
  dish: Dish,
  now: number,
): number {
  return Math.max(0, Math.floor((now - dishStartedAt(order, dish)) / 60_000));
}

export function elapsedMinutes(order: Order, now: number): number {
  return Math.max(
    0,
    Math.floor((now - new Date(order.createdAt).getTime()) / 60_000),
  );
}

export function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

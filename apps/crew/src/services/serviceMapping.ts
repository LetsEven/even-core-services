import type { OrderType } from "../types";

// clients.services (jsonb en la DB) usa slugs con guión, definidos en
// main-portal/src/types/index.ts (AVAILABLE_SERVICES) — no son iguales a
// OrderType ni a los nombres de columna FK de dish_order. "food-hall" no
// tiene pantalla en even-crew todavía, se ignora.
const SERVICE_SLUG_TO_ORDER_TYPE: Record<string, OrderType | undefined> = {
  "tap-order-pay": "tap",
  "flex-bill": "flex_bill",
  "tap-pay": "tap_pay",
  "pick-n-go": "pick_and_go",
  "room-service": "room",
  "food-hall": undefined,
};

export function getActiveOrderTypes(
  services: string[] | undefined,
): OrderType[] {
  if (!services) return [];
  const types = services
    .map((s) => SERVICE_SLUG_TO_ORDER_TYPE[s])
    .filter((t): t is OrderType => t != null);
  return [...new Set(types)];
}

// Solo para el switcher de servicios (sucursales con 2+ servicios activos) —
// no reemplaza los ORDER_TYPE_LABELS de Historial.tsx/OrderCard.tsx, que
// tienen su propio propósito (badges por orden).
export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  tap_pay: "Tap & Pay",
  tap: "Tap Order & Pay",
  flex_bill: "Flex Bill",
  room: "Room Service",
  pick_and_go: "Pick & Go",
};

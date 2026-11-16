import type { Order, OrderType } from "../../types";
import { parseLocationCode } from "../../utils/identifier";
import type { ServiceIndicator } from "../config/crewConfig";

export interface ServiceMeta {
  label: string;
  initial: string;
  dotClass: string;
}

// Inicial fija además del color: el estado nunca depende solo del color.
export const SERVICE_META: Record<OrderType, ServiceMeta> = {
  flex_bill: { label: "Flex Bill", initial: "F", dotClass: "bg-sky-500" },
  tap_pay: { label: "Tap & Pay", initial: "T", dotClass: "bg-violet-500" },
  tap: { label: "Tap Order & Pay", initial: "O", dotClass: "bg-amber-500" },
  room: { label: "Room Service", initial: "H", dotClass: "bg-rose-500" },
  pick_and_go: { label: "Pick & Go", initial: "P", dotClass: "bg-slate-500" },
};

export function showsDot(i: ServiceIndicator): boolean {
  return i === "dot" || i === "dot_initial";
}
export function showsInitial(i: ServiceIndicator): boolean {
  return i === "initial" || i === "dot_initial";
}

// Cuenta de una unidad: las mesas ignoran Room Service y Pick & Go; las
// habitaciones solo miran Room Service.
export function findUnitOrder(
  orders: Order[],
  code: string,
  kind: "table" | "room",
): Order | undefined {
  return orders.find((o) => {
    if (parseLocationCode(o.identifier) !== code) return false;
    return kind === "room"
      ? o.orderType === "room"
      : o.orderType !== "room" && o.orderType !== "pick_and_go";
  });
}

export type UnitState = "maintenance" | "cobro" | "ocupada" | "libre";

export function getUnitState(
  status: "available" | "occupied" | "maintenance",
  hasTapPayAccount: boolean,
  order: Order | undefined,
  hasOpenAccount: boolean,
): UnitState {
  if (status === "maintenance") return "maintenance";
  if (hasTapPayAccount) return "cobro";
  if (hasOpenAccount || order) return "ocupada";
  return "libre";
}

// Servicio de origen a mostrar en el puntito.
export function getUnitService(
  order: Order | undefined,
  hasTapPayAccount: boolean,
  kind: "table" | "room",
): OrderType | null {
  if (order) return order.orderType;
  if (hasTapPayAccount) return "tap_pay";
  return kind === "room" ? null : null;
}

import type { Branch } from "../../services/api";
import type { Order } from "../../types";
import { parseLocationCode } from "../../utils/identifier";

export type Waiter = { id: string; name: string };

// Cuenta de una mesa/habitación: la orden activa cuyo código coincide con el
// de la URL. Si hubiera varias (servicios distintos), gana la que no es
// Pick & Go, que nunca vive en una mesa.
export function findOrderForUnit(
  orders: Order[],
  unidad: string,
): Order | undefined {
  const matches = orders.filter(
    (o) => parseLocationCode(o.identifier) === unidad,
  );
  return matches.find((o) => o.orderType !== "pick_and_go") ?? matches[0];
}

export interface AccountTotals {
  total: number;
  paid: number;
  remaining: number;
  hasAmounts: boolean;
}

// Usa los montos "display" (con comisión de Flex Bill incrustada) cuando
// existen: es lo que se le cobra al cliente.
export function getAccountTotals(order: Order): AccountTotals {
  return {
    total: order.totalDisplayAmount ?? order.totalAmount ?? 0,
    paid: order.paidDisplayAmount ?? order.paidAmount ?? 0,
    remaining: order.remainingDisplayAmount ?? order.remainingAmount ?? 0,
    hasAmounts: order.totalAmount != null || order.paidAmount != null,
  };
}

export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export interface WaiterState {
  hasRealWaiters: boolean;
  isEven: boolean;
  isMine: boolean;
}

// La orden queda "reclamada" (mesero distinto de EVEN) una sola vez; a partir
// de ahí solo el mesero de la sesión del dispositivo puede desasignarla.
export function getWaiterState(
  waiterName: string | null | undefined,
  waiterId: string | null | undefined,
  session: Waiter | null,
  availableWaiters: Waiter[],
): WaiterState {
  const hasRealWaiters = availableWaiters.some((w) => w.id !== "EVEN");
  const isEven = waiterName == null || waiterName === "EVEN";
  const isMine =
    !isEven &&
    session != null &&
    (waiterId
      ? // El id del listado de Soft Restaurant puede venir numérico.
        String(waiterId) === String(session.id)
      : waiterName === session.name);
  return { hasRealWaiters, isEven, isMine };
}

export interface AccountPermissions {
  canAddDish: boolean;
  canEditDishes: boolean;
  canRegisterPayment: boolean;
  canPrintTicket: boolean;
  canViewMovements: boolean;
  canEditPrepTime: boolean;
  hideStatusButtons: boolean;
  hideStatusBadge: boolean;
}

export function getAccountPermissions(
  order: Order,
  branch: Branch | null | undefined,
  waiter: Pick<WaiterState, "isEven" | "isMine">,
): AccountPermissions {
  const canAddDish =
    order.orderType === "flex_bill" && branch != null && order.status !== "paid";
  return {
    canAddDish,
    // Quitar/reducir: solo el mesero asignado, o cualquiera si nadie la reclamó.
    canEditDishes: canAddDish && (waiter.isEven || waiter.isMine),
    canRegisterPayment:
      (order.orderType === "flex_bill" || order.orderType === "tap_pay") &&
      (order.remainingAmount ?? 0) > 0 &&
      branch != null,
    canPrintTicket:
      order.orderType === "tap_pay" &&
      branch != null &&
      (branch.tap_pay_print ?? true),
    canViewMovements: order.orderType === "flex_bill",
    canEditPrepTime:
      order.orderType === "pick_and_go" &&
      (order.cookingStatus ?? "preparing") === "preparing" &&
      order.prepTimeMinutes != null,
    hideStatusButtons:
      order.orderType === "pick_and_go" || order.orderType === "tap_pay",
    hideStatusBadge: order.orderType === "flex_bill",
  };
}

export function clampExtraMinutes(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(60, Math.max(0, Math.trunc(n)));
}

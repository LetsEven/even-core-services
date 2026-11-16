import type { Order } from "../../types";
import { formatFolio } from "../../utils/folio";

export type PaymentBucket = "cash" | "terminal" | "digital";

export interface DaySummary {
  /** Suma de montos base cobrados (sin propina). */
  sales: number;
  /** Suma de propinas. */
  tips: number;
  /** Total cobrado por método (incluye propina), por lo que suma sales + tips. */
  byMethod: Record<PaymentBucket, number>;
  orders: number;
  payments: number;
}

export function paymentBucket(cardType: string | null | undefined): PaymentBucket {
  if (cardType === "cash") return "cash";
  if (cardType === "terminal") return "terminal";
  return "digital";
}

const num = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

/**
 * Resume ventas, propinas y cobros por método a partir de las órdenes cargadas.
 * Una orden sin pagos registrados pero con `paidAmount` (cobro en línea) cuenta
 * como venta digital sin propina.
 */
export function summarizeOrders(orders: Order[]): DaySummary {
  const summary: DaySummary = {
    sales: 0,
    tips: 0,
    byMethod: { cash: 0, terminal: 0, digital: 0 },
    orders: orders.length,
    payments: 0,
  };
  for (const order of orders) {
    const payments = order.payments ?? [];
    if (payments.length === 0) {
      const paid = num(order.paidAmount);
      if (paid > 0) {
        summary.sales += paid;
        summary.byMethod.digital += paid;
        summary.payments += 1;
      }
      continue;
    }
    for (const p of payments) {
      const base = num(p.baseAmount);
      const tip = num(p.tipAmount);
      summary.sales += base;
      summary.tips += tip;
      summary.byMethod[paymentBucket(p.cardType)] += base + tip;
      summary.payments += 1;
    }
  }
  return summary;
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Texto sobre el que busca el filtro: mesa/identificador, folio, cliente y mesero. */
export function orderSearchText(order: Order): string {
  return normalize(
    [
      order.identifier,
      formatFolio(order.folio),
      order.folio != null ? String(order.folio) : "",
      order.customerName,
      order.waiterName,
      ...order.dishes.map((d) => d.userFolio),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function filterOrders(orders: Order[], query: string): Order[] {
  const q = normalize(query);
  if (!q) return orders;
  return orders.filter((o) => orderSearchText(o).includes(q));
}

export function matchesQuery(query: string, ...fields: (string | null | undefined)[]) {
  const q = normalize(query);
  if (!q) return true;
  return normalize(fields.filter(Boolean).join(" ")).includes(q);
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount);
}

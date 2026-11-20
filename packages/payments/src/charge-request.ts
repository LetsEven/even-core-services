import type { CartItemForPayment, ProcessPaymentRequest } from "./types";

/** Descuento "% en la cuenta" ya reclamado: personal (TK-0078) o promo QR. */
export interface ChargeDiscount {
  source: "personal" | "promo" | (string & {});
  id: string;
}

/** Qué orden identifica el cobro al backend (en vez de `service`, según la app). */
export interface ChargeOrderRef {
  /** FlexBill: dish_orders de la mesa. Se manda tal cual (incluido `null`). */
  id_table_order?: string | null;
  /** Tap & Pay: tap_pay_orders. */
  id_tap_pay_order?: string;
  payment_type?: string;
  selected_item_ids?: string[];
}

export interface ChargeRequestContext {
  /**
   * Servicio que fija la tarifa en el backend (regla 5 de docs/comisiones.md).
   * Es obligatorio declararlo: FlexBill y Tap & Pay pasan `undefined` a
   * propósito (el backend los resuelve por `id_table_order` / `id_tap_pay_order`;
   * audit R1) y no se cambia aquí. No normalizar los ids que viajan al cable.
   */
  service: string | undefined;
  paymentMethodId: string;
  /** Total a cobrar SIN financiamiento (a /payments nunca viaja el monto con MSI). */
  amount: number;
  description: string;
  orderId: string;
  /** `orderType` de Tap Order & Pay ("tap-order-pay"). */
  orderType?: string;
  tableNumber?: string;
  roomNumber?: string;
  restaurantId: string;
  /** Meses sin intereses elegidos (`null`/`0`/`undefined` = pago completo). */
  installments?: number | null;
  /** Consumo y propina REALES: nunca incluyen la comisión (reglas 2 y 3). */
  baseAmount: number;
  tipAmount: number;
  /** Ítems con precio real; `undefined` con MSI (el monto manda). Nunca inflados (regla 1). */
  items?: CartItemForPayment[];
  discount?: ChargeDiscount | null;
  order?: ChargeOrderRef;
  /** Tap & Pay: nombre del recibo que el backend registra al confirmar el cobro. */
  payerName?: string;
  /** Por defecto "MXN". */
  currency?: string;
}

/**
 * Único lugar que arma el cuerpo de POST /payments (sin los campos de
 * idempotencia, que pone `chargeSavedCard`). Reproduce EXACTAMENTE lo que
 * mandaba cada app: solo asigna campos, no calcula ni redondea montos.
 */
export function buildChargeRequest(ctx: ChargeRequestContext): Omit<ProcessPaymentRequest, "intentKey" | "fingerprint"> {
  return {
    paymentMethodId: ctx.paymentMethodId,
    amount: ctx.amount,
    currency: ctx.currency ?? "MXN",
    description: ctx.description,
    orderId: ctx.orderId,
    orderType: ctx.orderType,
    tableNumber: ctx.tableNumber,
    roomNumber: ctx.roomNumber,
    restaurantId: ctx.restaurantId,
    installments: ctx.installments || undefined,
    baseAmount: ctx.baseAmount,
    tipAmount: ctx.tipAmount,
    userDiscountId: ctx.discount?.source === "personal" ? ctx.discount.id : undefined,
    promoRedemptionId: ctx.discount?.source === "promo" ? ctx.discount.id : undefined,
    service: ctx.service,
    items: ctx.items,
    ...ctx.order,
    ...(ctx.payerName !== undefined ? { payerName: ctx.payerName } : {}),
  };
}

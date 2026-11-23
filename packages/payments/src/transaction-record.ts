import type { CommissionBreakdown } from "./commissions";

/** Campos de comisión de POST /payment-transactions (snake_case, como los espera el backend). */
export interface TransactionCommissionFields {
  base_amount: number;
  tip_amount: number;
  iva_tip: number;
  even_commission_total: number;
  even_commission_client: number;
  even_commission_restaurant: number;
  iva_even_client: number;
  iva_even_restaurant: number;
  even_client_charge: number;
  even_restaurant_charge: number;
  even_rate_applied: number;
  total_amount_charged: number;
  subtotal_for_commission: number;
}

export interface TransactionOrderRef {
  /** FlexBill. */
  id_table_order?: string | null;
  id_tap_orders_and_pay?: string | null;
  /** Tap & Pay. */
  id_tap_pay_order?: string | null;
  payment_type?: string;
  selected_item_ids?: string[];
}

export interface TransactionRecordParams<TOrder extends TransactionOrderRef = TransactionOrderRef> {
  /** Desglose local (preview) de consumo + propina con la tarifa del servicio. */
  breakdown: CommissionBreakdown;
  /** Total que se reporta: el financiado con MSI si aplica, si no el cobrado. */
  chargedTotal: number;
  paymentMethodId: string | null;
  restaurantId: number;
  ecartpayOrderId: string | null;
  paymentSource: string | null;
  transactionBy: string | undefined;
  order: TOrder;
  /** FlexBill: desglose real que devolvió /payments; manda sobre el local campo por campo. */
  serverBreakdown?: Partial<TransactionCommissionFields> | null;
}

export type TransactionRecord<TOrder extends TransactionOrderRef = TransactionOrderRef> = TransactionCommissionFields &
  TOrder & {
    payment_method_id: string | null;
    restaurant_id: number;
    ecartpay_order_id: string | null;
    payment_source: string | null;
    currency: string;
    transaction_by: string | undefined;
  };

/**
 * Cuerpo de POST /payment-transactions (FlexBill y Tap & Pay lo reportan desde
 * el cliente) armado una sola vez desde el CommissionBreakdown. Reproduce lo
 * que mandaba cada app: los cargos Even van SIN redondear (comisión + IVA,
 * a diferencia de `breakdown.even*Charge`, que ya viene redondeado) y la tasa
 * aplicada es la mezclada sobre consumo + propina. Nunca lleva precios inflados.
 */
export function toTransactionRecord<TOrder extends TransactionOrderRef>(
  p: TransactionRecordParams<TOrder>,
): TransactionRecord<TOrder> {
  const b = p.breakdown;
  const server = p.serverBreakdown ?? undefined;
  const evenRateApplied = b.subtotalForCommission > 0 ? (b.evenCommissionTotal / b.subtotalForCommission) * 100 : 0;

  return {
    payment_method_id: p.paymentMethodId,
    restaurant_id: p.restaurantId,
    ...p.order,
    ecartpay_order_id: p.ecartpayOrderId,
    payment_source: p.paymentSource,
    base_amount: server?.base_amount ?? b.baseAmount,
    tip_amount: server?.tip_amount ?? b.tipAmount,
    iva_tip: server?.iva_tip ?? b.ivaTip,
    even_commission_total: server?.even_commission_total ?? b.evenCommissionTotal,
    even_commission_client: server?.even_commission_client ?? b.evenCommissionClient,
    even_commission_restaurant: server?.even_commission_restaurant ?? b.evenCommissionRestaurant,
    iva_even_client: server?.iva_even_client ?? b.ivaEvenClient,
    iva_even_restaurant: server?.iva_even_restaurant ?? b.ivaEvenRestaurant,
    even_client_charge: server?.even_client_charge ?? b.evenCommissionClient + b.ivaEvenClient,
    even_restaurant_charge: server?.even_restaurant_charge ?? b.evenCommissionRestaurant + b.ivaEvenRestaurant,
    even_rate_applied: server?.even_rate_applied ?? evenRateApplied,
    total_amount_charged: server?.total_amount_charged ?? p.chargedTotal,
    subtotal_for_commission: server?.subtotal_for_commission ?? b.subtotalForCommission,
    currency: "MXN",
    transaction_by: p.transactionBy,
  };
}

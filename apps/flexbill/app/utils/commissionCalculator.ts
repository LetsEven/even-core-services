import {
  createServicePayments,
  formatMXN,
  type CommissionBreakdown,
  type CommissionLineItem,
  type CommissionRates,
} from "@even/payments";

// Reparto de comisión de FlexBill: 4% restaurante, el cliente no paga comisión.
// Tabla completa y reglas en docs/comisiones.md. El backend es la autoridad.
export const COMMISSION_SERVICE = "flex-bill" as const;

export { formatMXN, type CommissionBreakdown, type CommissionRates };

const payments = createServicePayments(COMMISSION_SERVICE);

export const getCommissionRates = payments.getCommissionRates;
export const calculateCommissions = payments.calculateCommissions;

// ============================================================
// Comisión por ítem — espejo de even-backend/src/utils/commissionCalculator.js.
// Solo para PREVIEW visual (mostrar un número antes de pagar) — el backend
// recalcula todo desde los dish_order reales al crear la transacción, así
// que esto nunca es la autoridad de cuánto se cobra.
// ============================================================

export type { ItemCommissionRate } from "@even/payments";
export type FlexBillCommissionLineItem = CommissionLineItem;

// Tarifa fija por ítem (unitPrice se conserva como parámetro por compatibilidad).
export const getItemCommissionRate = payments.getItemCommissionRate;

// Precio que ve el cliente: precio real + comisión del cliente + su IVA. Con
// 0% cliente es el precio real.
export const getItemDisplayPrice = payments.getItemDisplayPrice;

// full-bill / select-items: ítems exactos conocidos.
export const calculateFlexBillItemCommission = payments.calculateItemCommission;

// equal-shares / choose-amount: fracción del total real de la mesa.
export const calculateFlexBillProportionalCommission = payments.calculateProportionalCommission;

// Subtotal fijo a mostrar: consumo + su propia comisión, redondeando POR
// ÍTEM — el mismo método que usa el backend para total_display_price (ver
// flexBillService.js/kitchenService.js).
export const getDisplaySubtotal = payments.getDisplaySubtotal;

// Igual que getDisplaySubtotal, pero para pagos que son una fracción de la
// mesa (equal-shares/choose-amount): la fracción se aplica sobre el subtotal
// ya redondeado de TODOS los ítems de la mesa.
export const getDisplaySubtotalForFraction = payments.getDisplaySubtotalForFraction;

// Dado un monto que el cliente quiere ver como "Propina", resuelve qué propina
// real hay que mandar al cálculo de comisión para que Total - Subtotal fijo
// cierre exacto contra ese monto. `computeBreakdown` es la misma función que
// arma el breakdown real según el tipo de pago.
export const resolveTipAmountForTargetDisplay = payments.resolveTipAmountForTargetDisplay;

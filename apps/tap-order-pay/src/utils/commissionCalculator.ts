import {
  createServicePayments,
  formatMXN,
  type CommissionBreakdown,
  type CommissionLineItem,
  type CommissionRates,
} from "@even/payments";

// Reparto de comisión de Tap Order & Pay: 4% restaurante, el cliente no paga comisión.
// Tabla completa y reglas en docs/comisiones.md. El backend es la autoridad.
export const COMMISSION_SERVICE = "tap-order-and-pay" as const;

export { formatMXN, type CommissionBreakdown, type CommissionRates };

const payments = createServicePayments(COMMISSION_SERVICE);

export const getCommissionRates = payments.getCommissionRates;
export const calculateCommissions = payments.calculateCommissions;

// ============================================================
// CONVENCIÓN DE COMISIÓN (léelo antes de tocar montos en pantalla)
//
// Tap Order & Pay es 0 % cliente / 4 % restaurante: el comensal NO ve ni paga
// comisión, así que en pantalla todo es el monto real (docs/comisiones.md):
//
//  - getItemDisplayPrice devuelve el precio real del platillo (regla 1): el
//    precio de carrito y de menú nunca se infla ni se manda inflado.
//  - Subtotal + Propina mostrados suman siempre el Total (regla 4); las
//    pantallas que desglosan un pago usan getDisplaySubtotal + getDisplayTip.
//  - Al backend/POS viaja baseAmount (consumo real) y tipAmount (propina
//    real); la comisión del restaurante se calcula aparte y nunca se manda
//    como parte de la base ni de la propina (reglas 2 y 3). El backend
//    recalcula todo desde el carrito (even-backend montoDeCobro).
//
// Las funciones de abajo son genéricas y leen la tarifa de
// SERVICE_COMMISSION_RATES (@even/payments); no hay constantes de comisión
// propias. Si la tarifa de este servicio cambiara a un reparto con comisión
// de cliente (como Pick & Go, 2/2), el precio por ítem y la propina mostrada
// pasarían a incluirla automáticamente: eso exige cambiar la tarifa en el
// backend y en @even/payments en el mismo ciclo y con su test (regla 6).
// ============================================================

export type { ItemCommissionRate } from "@even/payments";
export type ItemDisplayLineItem = CommissionLineItem;

// Tarifa fija por ítem (misma que getCommissionRates).
export const getItemCommissionRate = payments.getItemCommissionRate;

// Precio que ve el cliente: precio real + comisión del cliente + IVA sobre
// esa comisión. Con 0 % cliente es el precio real.
export const getItemDisplayPrice = payments.getItemDisplayPrice;

// Subtotal a mostrar, redondeando POR ÍTEM (precio x cantidad, cada línea
// redondeada) y sumando: sumar dos totales ya redondeados puede dar un
// centavo distinto. Tap Order & Pay siempre paga el carrito completo, así que
// no necesita las variantes por fracción de FlexBill.
export const getDisplaySubtotal = payments.getDisplaySubtotal;

// Propina que ve el comensal: lo que le falta al Subtotal para llegar al
// Total cobrado (incluye el costo de MSI si aplica). Con 0 % cliente coincide
// con la propina real.
export const getDisplayTip = payments.getDisplayTip;

// Dado un monto que el cliente quiere ver como "Propina", resuelve la propina
// real que hay que mandar al cálculo de comisión para que Total - Subtotal
// cierre exacto contra ese monto. `computeBreakdown` arma el breakdown real
// para una propina dada (aquí, calculateCommissions por total).
export const resolveTipAmountForTargetDisplay = payments.resolveTipAmountForTargetDisplay;

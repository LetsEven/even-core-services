import {
  createServicePayments,
  formatMXN,
  type CommissionBreakdown,
  type CommissionRates,
} from "@even/payments";

// Reparto de comisión de Pick & Go: 2% restaurante + 2% cliente (comisión de servicio visible).
// Tabla completa y reglas en docs/comisiones.md. El backend es la autoridad.
export const COMMISSION_SERVICE = "pick-and-go" as const;

export { formatMXN, type CommissionBreakdown, type CommissionRates };

const payments = createServicePayments(COMMISSION_SERVICE);

export const getCommissionRates = payments.getCommissionRates;
export const calculateCommissions = payments.calculateCommissions;

// Pick & Go no infla el precio mostrado con su propio modelo, pero el historial es compartido
// entre servicios y puede mostrar órdenes de Tap Order & Pay / Flex Bill — ver HistoryTab.tsx.

// Comisión por ítem — espejo de even-backend/src/utils/commissionCalculator.js.
// Solo para PREVIEW visual; el backend recalcula todo desde el carrito.
export type { ItemCommissionRate } from "@even/payments";
export const getItemCommissionRate = payments.getItemCommissionRate;
// Precio que ve el cliente: precio real + comisión del cliente + IVA ya incrustados.
// Con 0 % cliente es el precio real (regla 1 de docs/comisiones.md).
export const getItemDisplayPrice = payments.getItemDisplayPrice;

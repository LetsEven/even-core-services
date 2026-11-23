import {
  createServicePayments,
  formatMXN,
  type CommissionBreakdown,
  type CommissionRates,
} from "@even/payments";

// Reparto de comisión de Tap & Pay: 4% restaurante, el cliente no paga comisión.
// Tabla completa y reglas en docs/comisiones.md. El backend es la autoridad.
export const COMMISSION_SERVICE = "tap-and-pay" as const;

export { formatMXN, type CommissionBreakdown, type CommissionRates };

const payments = createServicePayments(COMMISSION_SERVICE);

export const getCommissionRates = payments.getCommissionRates;
export const calculateCommissions = payments.calculateCommissions;

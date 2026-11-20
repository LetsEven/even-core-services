import { IVA_FACTOR } from "./commissions";

/**
 * Total con financiamiento (MSI): fórmula de EcartPay, markup sobre el monto
 * final con IVA sobre la tasa: `total / (1 - tasa% * IVA)`. Sin redondeo: cada
 * pantalla redondea al mostrar (`toFixed(2)`), igual que antes de centralizarla.
 * A `/payments` siempre viaja el monto SIN financiamiento; esto es solo para
 * mostrar y para el total que se reporta tras el cobro.
 */
export function computeMsiTotal(total: number, ratePct: number): number {
  return total / (1 - (ratePct / 100) * IVA_FACTOR);
}

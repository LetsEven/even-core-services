/** Porcentajes de propina que ofrecen las apps (además de "Otro"). */
export const TIP_PRESETS = [0, 10, 15, 20] as const;

/** Monto mínimo de compra (con propina y comisión) para poder pagar. */
export const MINIMUM_AMOUNT = 20;

/**
 * Cómo se redondea la propina calculada por porcentaje. Cada app conserva el
 * suyo (unificarlo es una decisión de producto aparte; ver audit R4):
 * - `"none"`: sin redondear (Pick & Go, Room Service, Tap & Pay).
 * - `"cents"`: a centavos antes de calcular la comisión (Tap Order & Pay, FlexBill).
 */
export type TipRounding = "none" | "cents";

/** Propina de `pct` % sobre `base`, con el redondeo propio de la app. */
export function computeTipAmount(base: number, pct: number, rounding: TipRounding): number {
  const tip = (base * pct) / 100;
  return rounding === "cents" ? Math.round(tip * 100) / 100 : tip;
}

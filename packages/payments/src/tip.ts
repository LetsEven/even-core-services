/** Porcentajes de propina que ofrecen las apps (además de "Otro"). */
export const TIP_PRESETS = [0, 10, 15, 20] as const;

/** Monto mínimo de compra (con propina y comisión) para poder pagar. */
export const MINIMUM_AMOUNT = 20;

/**
 * Propina de `pct` % sobre `base`. Sin redondear, igual que even-backend: la
 * propina viaja y se suma cruda; solo el total final se redondea a centavos
 * (`calculateCommissions`: `r2(base + propina + comisión cliente)`).
 */
export function computeTipAmount(base: number, pct: number): number {
  return (base * pct) / 100;
}

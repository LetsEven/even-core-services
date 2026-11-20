/**
 * Pago de una cuenta de mesa (FlexBill y Tap & Pay): dividir entre N, mínimo
 * de cobro y los rechazos del backend que obligan a regresar a la cuenta.
 */

/** Monto mínimo (con propina y comisión) para pagar una cuenta de mesa. */
export const TABLE_PAYMENT_MINIMUM_AMOUNT = 15;

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Parte de cada quien al dividir la cuenta entre `people`: sale del total de
 * la cuenta, nunca es más de lo que falta (`unpaid`) y, si después de este pago
 * solo quedaría el residuo del redondeo, se cobra todo lo que falta.
 */
export function equalShare(total: number, people: number, unpaid: number): number {
  const share = centavos(total / people);
  const falta = centavos(unpaid);
  // Centavos que sobran cuando la parte se redondea hacia abajo
  const residuo = Math.max(0, centavos(total - share * people));
  return falta - share <= residuo + 1e-9 ? falta : share;
}

/** Lo que se puede pagar descontando lo que otro comensal tiene apartado con wallet. */
export function withoutHeldAmount(amount: number, heldByOthers: number | null | undefined): number {
  return Math.max(amount - (heldByOthers || 0), 0);
}

export type TableChargeBlock =
  | { kind: "order_changed" }
  | { kind: "cuenta_apartada"; heldByOthers: number };

/**
 * Lee el rechazo de un cobro u orden de wallet. `order_changed`: la cuenta
 * cambió en el POS antes del cargo. `cuenta_apartada`: otro comensal está
 * pagando parte de la cuenta con Apple/Google Pay. Cualquier otro → null.
 */
export function readTableChargeBlock(result: unknown): TableChargeBlock | null {
  if (!result || typeof result !== "object") return null;
  const r = result as { code?: string; error?: unknown };
  const err =
    typeof r.error === "object" && r.error
      ? (r.error as { code?: string; type?: string; details?: { apartado_por_otros?: number } })
      : undefined;
  const code = r.code ?? err?.code ?? err?.type;
  if (code === "order_changed") return { kind: "order_changed" };
  if (code === "cuenta_apartada") {
    return { kind: "cuenta_apartada", heldByOthers: err?.details?.apartado_por_otros ?? 0 };
  }
  return null;
}

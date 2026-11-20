/**
 * Predicado de reintento de /tap-orders/confirm (Tap Order & Pay): el cobro ya
 * se hizo, así que además de `confirm_in_progress` se reintenta
 * `confirm_conflict`, la red caída (sin status), 429 y 5xx — el confirm es
 * idempotente por ecartpay_order_id (even-backend, audit R2). Pick & Go y Room
 * Service NO lo usan: reintentan solo `confirm_in_progress`.
 */
export function isTopConfirmRetryable(result: { code?: string; status?: number }): boolean {
  return (
    result.code === "confirm_in_progress" ||
    result.code === "confirm_conflict" ||
    result.status === undefined ||
    result.status === 429 ||
    result.status >= 500
  );
}

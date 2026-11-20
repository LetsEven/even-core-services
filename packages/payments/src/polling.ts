import type { PaymentIntentStatusResponse } from "./types";

export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS = 60000;

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  /** Inyectables para tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function resolveOptions(options?: PollOptions) {
  return {
    intervalMs: options?.intervalMs ?? POLL_INTERVAL_MS,
    timeoutMs: options?.timeoutMs ?? POLL_TIMEOUT_MS,
    sleep: options?.sleep ?? defaultSleep,
    now: options?.now ?? Date.now,
  };
}

/**
 * Consulta GET /payments/intents/:key hasta que el cobro quede
 * 'charged'/'confirmed' (devuelve su ecartpay_order_id), 'unknown'
 * (null — terminal), o se agote el tiempo (null).
 */
export async function waitForChargedIntent(
  getStatus: (intentKey: string) => Promise<PaymentIntentStatusResponse>,
  intentKey: string,
  options?: PollOptions,
): Promise<string | null> {
  const { intervalMs, timeoutMs, sleep, now } = resolveOptions(options);
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    const statusRes = await getStatus(intentKey);
    if (statusRes.success) {
      if (statusRes.status === "unknown") return null;
      if (
        (statusRes.status === "charged" || statusRes.status === "confirmed") &&
        statusRes.ecartpay_order_id
      ) {
        return statusRes.ecartpay_order_id;
      }
    }
    await sleep(intervalMs);
  }
  return null;
}

export interface ConfirmResponse<TOrder> {
  success: boolean;
  data?: { order?: TOrder | null };
  code?: string;
  /** HTTP status (undefined si hubo un fallo de red). Lo lee el predicado de cada app. */
  status?: number;
}

/**
 * Solo el 409 `confirm_in_progress`. Estricto; ya no es el predicado por
 * defecto (ver `isConfirmRetryable`), queda para apps que lo pidan.
 */
export function isConfirmInProgress(result: { code?: string }): boolean {
  return result.code === "confirm_in_progress";
}

/**
 * Predicado de reintento por defecto de pollConfirm. El cobro ya se hizo, así
 * que un /confirm que no resolvió se reintenta si fue `confirm_in_progress`,
 * `confirm_conflict`, una red caída (sin status), 429 o 5xx. Los /confirm de
 * Pick & Go, Room Service y Tap Order & Pay son idempotentes por
 * `ecartpay_order_id`, así que reintentar es seguro. Cualquier otro 4xx es
 * terminal.
 */
export function isConfirmRetryable(result: { code?: string; status?: number }): boolean {
  return (
    result.code === "confirm_in_progress" ||
    result.code === "confirm_conflict" ||
    result.status === undefined ||
    result.status === 429 ||
    result.status >= 500
  );
}

export interface PollConfirmOptions<TOrder> extends PollOptions {
  /**
   * Decide si un /confirm que no resolvió se reintenta. Por defecto,
   * `isConfirmRetryable`, igual para todas las apps.
   */
  isConfirmRetryable?: (result: ConfirmResponse<TOrder>) => boolean;
}

/**
 * Reintenta /confirm (de cada app: tap orders, room orders...) hasta que
 * resuelva o se agote el tiempo. Reintenta los fallos transitorios
 * (ver `isConfirmRetryable`); cualquier otro fallo es terminal. Siempre hace al menos un intento.
 */
export async function pollConfirm<TOrder>(
  confirm: () => Promise<ConfirmResponse<TOrder>>,
  options?: PollConfirmOptions<TOrder>,
): Promise<{ success: true; order: TOrder } | { success: false }> {
  const { intervalMs, timeoutMs, sleep, now } = resolveOptions(options);
  const isRetryable = options?.isConfirmRetryable ?? isConfirmRetryable;
  const deadline = now() + timeoutMs;
  let firstAttempt = true;

  while (firstAttempt || now() < deadline) {
    firstAttempt = false;
    const confirmResult = await confirm();

    if (confirmResult.success && confirmResult.data?.order) {
      return { success: true, order: confirmResult.data.order };
    }
    if (!isRetryable(confirmResult)) {
      return { success: false };
    }
    await sleep(intervalMs);
  }

  return { success: false };
}

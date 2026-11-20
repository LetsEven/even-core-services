import { chargeSavedCard, type ChargeOutcome, type ChargeSavedCardParams } from "./charge";
import { paymentIntentStore, type PaymentIntentStore } from "./idempotency";
import type { PaymentService } from "./payment-service";
import { pollConfirm, type ConfirmResponse, type PollConfirmOptions, type PollOptions } from "./polling";

export interface SavedCardChargeOptions<TOrder, TBody = unknown> {
  paymentService: Pick<PaymentService, "processPayment" | "getPaymentIntentStatus">;
  /** Por defecto, el store de sesión compartido (`paymentIntentStore`). */
  store?: PaymentIntentStore;
  /**
   * /confirm de la app (tap orders, room orders, pick & go...). Opcional: las
   * apps que registran el pago por otro camino (Tap & Pay) solo usan `charge`.
   */
  confirm?: (body: TBody) => Promise<ConfirmResponse<TOrder>>;
  /** Predicado de reintento de /confirm (por defecto, `isConfirmRetryable`: igual para todas las apps). */
  isConfirmRetryable?: PollConfirmOptions<TOrder>["isConfirmRetryable"];
  /** Forma del id de la orden en el 2xx de /payments (por defecto, `payment.id`). */
  extractOrderId?: ChargeSavedCardParams["extractOrderId"];
  /** Solo para tests: intervalo, timeout y reloj. */
  poll?: PollOptions;
}

export type SavedCardChargeRequest = Pick<
  ChargeSavedCardParams,
  "fingerprintInput" | "request" | "onVerifying"
>;

export interface SavedCardCharge<TOrder, TBody = unknown> {
  /**
   * Cobra con idempotencia. Reglas intactas (audit R6): `store.clear()` solo en
   * intent_mismatch y payment_rejected; payment_in_progress solo hace polling;
   * `unconfirmed` nunca debe ofrecer reintentar. El mapeo a mensajes queda en la página.
   */
  charge(params: SavedCardChargeRequest): Promise<ChargeOutcome>;
  /** /confirm con reintentos según el predicado de la app; `buildBody` se evalúa en cada intento. */
  confirm(buildBody: () => TBody): Promise<{ success: true; order: TOrder } | { success: false }>;
}

/** Une `chargeSavedCard` y `pollConfirm` con la configuración de una app. */
export function createSavedCardCharge<TOrder, TBody = unknown>(
  getOptions: () => SavedCardChargeOptions<TOrder, TBody>,
): SavedCardCharge<TOrder, TBody> {
  return {
    charge({ fingerprintInput, request, onVerifying }) {
      const o = getOptions();
      return chargeSavedCard({
        service: o.paymentService,
        store: o.store ?? paymentIntentStore,
        fingerprintInput,
        request,
        onVerifying,
        poll: o.poll,
        extractOrderId: o.extractOrderId,
      });
    },
    confirm(buildBody) {
      const o = getOptions();
      const confirm = o.confirm;
      if (!confirm) throw new Error("useSavedCardCharge: falta la opción `confirm`");
      return pollConfirm(() => confirm(buildBody()), { ...o.poll, isConfirmRetryable: o.isConfirmRetryable });
    },
  };
}

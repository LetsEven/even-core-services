import { createPaymentService, type TransactionRecord } from "@even/payments";
import type { ApiResponse } from "@even/api-client";
import { requestWithAuth } from "@/app/services/request-helper";

export type { ApiResponse } from "@even/api-client";
export {
  isDefinitiveWalletRejection,
  type AddPaymentMethodRequest,
  type MsiConfig,
  type MsiOption,
  type PaymentHistory,
  type PaymentIntentStatus,
  type PaymentIntentStatusResponse,
  type PaymentMethod,
  type ProcessPaymentRequest,
} from "@even/payments";

const sharedPaymentService = createPaymentService(requestWithAuth);

// Registra el cobro: el backend cierra la orden, la manda al POS e imprime el ticket
function recordPaymentTransaction(
  params: TransactionRecord<{ id_retail_order: string }>,
): Promise<ApiResponse<unknown>> {
  return requestWithAuth("/payment-transactions", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export const paymentService = {
  ...sharedPaymentService,
  recordPaymentTransaction,
};

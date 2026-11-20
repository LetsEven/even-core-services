export const PACKAGE_NAME = "@even/payments";
export * from "./types";
export { createPaymentService, type PaymentService } from "./payment-service";
export {
  classifyGooglePayError,
  isDefinitiveWalletRejection,
  isWalletDocumentSecure,
  WALLET_PAID_STATUSES,
} from "./wallet";
export {
  PAYMENT_INTENT_STORAGE_KEY,
  computeFingerprint,
  createPaymentIntentStore,
  generateIntentKey,
  paymentIntentStore,
  type FingerprintInput,
  type FingerprintItemInput,
  type IntentStorage,
  type PaymentIntentStore,
  type StoredPaymentIntent,
} from "./idempotency";
export {
  isConfirmInProgress,
  isConfirmRetryable,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  pollConfirm,
  waitForChargedIntent,
  type ConfirmResponse,
  type PollConfirmOptions,
  type PollOptions,
} from "./polling";
export {
  createSavedCardCharge,
  type SavedCardCharge,
  type SavedCardChargeOptions,
  type SavedCardChargeRequest,
} from "./saved-card-charge";
export {
  chargeSavedCard,
  getErrorCode,
  type ChargeOutcome,
  type ChargeSavedCardParams,
} from "./charge";
export {
  createEcartPayCheckout,
  isEcartPaySDKLoaded,
  normalizeEcartPayResult,
  waitForEcartPaySDK,
  type EcartPayCheckoutOptions,
  type EcartPayCheckoutResult,
  type EcartPaySDK,
} from "./ecartpay";
export {
  calculateCommissions,
  DEFAULT_COMMISSION_RATES,
  formatMXN,
  getCommissionRates,
  IVA_FACTOR,
  IVA_RATE,
  SERVICE_COMMISSION_RATES,
  type CommissionBreakdown,
  type CommissionRates,
  type CommissionService,
} from "./commissions";
export {
  createServicePayments,
  type CommissionLineItem,
  type ItemCommissionRate,
  type ServicePayments,
} from "./service-payments";
export {
  buildChargeRequest,
  type ChargeDiscount,
  type ChargeOrderRef,
  type ChargeRequestContext,
} from "./charge-request";
export {
  toTransactionRecord,
  type TransactionCommissionFields,
  type TransactionOrderRef,
  type TransactionRecord,
  type TransactionRecordParams,
} from "./transaction-record";
export { computeMsiTotal } from "./msi";
export { computeTipAmount, MINIMUM_AMOUNT, TIP_PRESETS } from "./tip";
export { CARD_EXPIRY_YEARS_AHEAD, getCardExpiryYears } from "./card-expiry";
export {
  createInvoiceService,
  createTicketService,
  getAuthHeaders,
  type BillingProfile,
  type BillingServiceOptions,
  type FiscalData,
  type InvoiceInfo,
  type InvoiceService,
  type TicketService,
} from "./billing";
export { clearCachedWalletOrder, getOrCreateWalletOrderId } from "./wallet-order-cache";

import { createInvoiceService } from "@even/payments";
import { requestWithAuth } from "./request-helper";

export type { BillingProfile, FiscalData, InvoiceInfo } from "@even/payments";

export const invoiceService = createInvoiceService({
  requestWithAuth,
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
});

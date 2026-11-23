import type { Requester } from "@even/api-client";
import { createInvoiceService, getAuthHeaders } from "@even/payments";

export type { BillingProfile, FiscalData, InvoiceInfo } from "@even/payments";

/**
 * FlexBill conserva el transporte que tenía antes de compartir la facturación: fetch directo, sin
 * refresh de token en 401, `data` es el cuerpo completo de la respuesta y el error es el `message`
 * del backend como texto. Adoptar `requestWithAuth` del api-client (como PG/RS/TOP/TP y redesign)
 * cambiaría qué devuelve `res.data` y los mensajes de error; pendiente de confirmar contra even-backend.
 */
const legacyRequestWithAuth = (async (endpoint: string, options?: RequestInit) => {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
      ...options,
      headers: { ...getAuthHeaders(true), ...(options?.headers as Record<string, string>) },
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.message || "Request failed" };
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, error: (err as Error).message || "Network error" };
  }
}) as unknown as Requester;

export const invoiceService = createInvoiceService({
  requestWithAuth: legacyRequestWithAuth,
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
});

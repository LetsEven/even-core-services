import type { Requester } from "@even/api-client";

/**
 * Facturación (CFDI) y tickets de even-backend. Los comparten las cinco apps de comensal; cada una
 * pasa su `requestWithAuth` (con su refresh de token) y la URL base de la API.
 */

export interface FiscalData {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  email?: string;
  usoCfdi: string;
}

export interface BillingProfile {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  codigo_postal: string;
  email?: string;
  uso_cfdi: string;
}

export interface InvoiceInfo {
  invoiceId: string | null;
  status: string | null;
}

/** Cabeceras de la sesión actual: token de usuario o, si no hay, el id de invitado. */
export function getAuthHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = json ? { "Content-Type": "application/json" } : {};
  if (typeof window === "undefined") return headers;
  const token = localStorage.getItem("even_access_token");
  const guestId = localStorage.getItem("even-guest-id") || "";
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (guestId) {
    headers["x-guest-id"] = guestId;
  }
  return headers;
}

export interface BillingServiceOptions {
  requestWithAuth: Requester;
  baseUrl: string | undefined;
}

function errorText(error: unknown, fallback: string): string {
  return typeof error === "string" ? error : fallback;
}

export function createInvoiceService({ requestWithAuth, baseUrl }: BillingServiceOptions) {
  return {
    async getBillingProfile(): Promise<BillingProfile | null> {
      const res = await requestWithAuth<BillingProfile>("/invoices/billing-profile");
      return res.data ?? null;
    },

    async getTransactionInvoice(transactionId: string): Promise<InvoiceInfo | null> {
      const res = await requestWithAuth<InvoiceInfo>(`/invoices/transaction/${transactionId}`);
      return res.data ?? null;
    },

    async previewInvoice(transactionId: string, fiscalData: FiscalData, restaurantId: number): Promise<Blob> {
      const response = await fetch(`${baseUrl}/invoices/preview`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ transactionId, fiscalData, restaurantId }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Error al generar vista previa.");
      }
      return response.blob();
    },

    async createInvoice(
      transactionId: string,
      fiscalData: FiscalData,
      restaurantId: number,
    ): Promise<{ invoiceId: string; uuid: string; status: string }> {
      const res = await requestWithAuth<{ invoiceId: string; uuid: string; status: string }>("/invoices", {
        method: "POST",
        body: JSON.stringify({ transactionId, fiscalData, restaurantId }),
      });
      if (!res.success || !res.data) {
        throw new Error(errorText(res.error, "Error al crear la factura."));
      }
      return res.data;
    },

    async downloadInvoicePdf(invoiceId: string, restaurantId: number): Promise<Blob> {
      const response = await fetch(`${baseUrl}/invoices/${invoiceId}/pdf?restaurantId=${restaurantId}`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Error al descargar la factura.");
      return response.blob();
    },

    async sendInvoiceByEmail(invoiceId: string, restaurantId: number, email?: string): Promise<void> {
      const res = await requestWithAuth<{ ok: boolean }>(`/invoices/${invoiceId}/email`, {
        method: "POST",
        body: JSON.stringify({ restaurantId, email }),
      });
      if (!res.success) {
        throw new Error(errorText(res.error, "Error al enviar la factura."));
      }
    },
  };
}

export type InvoiceService = ReturnType<typeof createInvoiceService>;

export function createTicketService({ baseUrl }: Pick<BillingServiceOptions, "baseUrl">) {
  return {
    async downloadTicketPdf(transactionId: string): Promise<Blob> {
      const response = await fetch(`${baseUrl}/tickets/${transactionId}/pdf`, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error("Error al descargar el ticket.");
      return response.blob();
    },
  };
}

export type TicketService = ReturnType<typeof createTicketService>;

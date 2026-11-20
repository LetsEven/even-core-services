// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requester } from "@even/api-client";
import { createInvoiceService, createTicketService, getAuthHeaders } from "./billing";

const BASE = "https://api.test";

function okBlob() {
  return { ok: true, blob: async () => new Blob(["pdf"]) } as Response;
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAuthHeaders", () => {
  it("usa el token de usuario si existe", () => {
    localStorage.setItem("even_access_token", "tok");
    localStorage.setItem("even-guest-id", "g1");
    expect(getAuthHeaders()).toEqual({ Authorization: "Bearer tok" });
  });

  it("cae al id de invitado y agrega content-type si se pide json", () => {
    localStorage.setItem("even-guest-id", "g1");
    expect(getAuthHeaders(true)).toEqual({ "Content-Type": "application/json", "x-guest-id": "g1" });
  });

  it("sin sesión no manda credenciales", () => {
    expect(getAuthHeaders()).toEqual({});
  });
});

describe("createInvoiceService", () => {
  const requestWithAuth = vi.fn() as unknown as Requester & ReturnType<typeof vi.fn>;
  const service = createInvoiceService({ requestWithAuth, baseUrl: BASE });
  const fiscal = { rfc: "X", razonSocial: "Y", regimenFiscal: "601", codigoPostal: "83000", usoCfdi: "G03" };

  beforeEach(() => {
    (requestWithAuth as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  it("createInvoice devuelve los datos o lanza con el error del backend", async () => {
    const mock = requestWithAuth as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce({ success: true, data: { invoiceId: "i1", uuid: "u", status: "valid" } });
    await expect(service.createInvoice("t1", fiscal, 7)).resolves.toMatchObject({ invoiceId: "i1" });
    expect(mock).toHaveBeenCalledWith("/invoices", {
      method: "POST",
      body: JSON.stringify({ transactionId: "t1", fiscalData: fiscal, restaurantId: 7 }),
    });

    mock.mockResolvedValueOnce({ success: false, error: "RFC inválido" });
    await expect(service.createInvoice("t1", fiscal, 7)).rejects.toThrow("RFC inválido");
    mock.mockResolvedValueOnce({ success: false, error: { code: "x" } });
    await expect(service.createInvoice("t1", fiscal, 7)).rejects.toThrow("Error al crear la factura.");
  });

  it("sendInvoiceByEmail lanza el mensaje de error si falla", async () => {
    const mock = requestWithAuth as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce({ success: false });
    await expect(service.sendInvoiceByEmail("i1", 7, "a@b.c")).rejects.toThrow("Error al enviar la factura.");
  });

  it("downloadInvoicePdf pide el PDF con las cabeceras de sesión", async () => {
    localStorage.setItem("even_access_token", "tok");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okBlob());
    await service.downloadInvoicePdf("i1", 7);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/invoices/i1/pdf?restaurantId=7`, {
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("previewInvoice usa el mensaje del backend si responde con error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Sin datos fiscales" }),
    } as Response);
    await expect(service.previewInvoice("t1", fiscal, 7)).rejects.toThrow("Sin datos fiscales");
  });
});

describe("createTicketService", () => {
  const service = createTicketService({ baseUrl: BASE });

  it("descarga el ticket", async () => {
    localStorage.setItem("even-guest-id", "g1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okBlob());
    await service.downloadTicketPdf("t9");
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/tickets/t9/pdf`, { headers: { "x-guest-id": "g1" } });
  });

  it("lanza si la respuesta no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false } as Response);
    await expect(service.downloadTicketPdf("t9")).rejects.toThrow("Error al descargar el ticket.");
  });
});

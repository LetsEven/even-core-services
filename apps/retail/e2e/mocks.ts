import { mockPaymentsApi, type MockResponse, type PaymentsApiOptions } from "@even/e2e";
import type { Page } from "@playwright/test";

/** El host del socket sale de quitar /api; https por upgrade-insecure-requests del CSP. */
export const API_URL = "https://backend.e2e.test/api";

export const RESTAURANT_ID = 5;
export const BRANCH_NUMBER = 2;
export const ORDER_ID = "7d0c3a3e-6c43-4d7e-9a2b-1f5f6f1e2a10";
export const BRANCH_URL = `/${RESTAURANT_ID}/${BRANCH_NUMBER}`;
export const ORDER_URL = `${BRANCH_URL}/order`;
export const CHECKOUT_URL = `${BRANCH_URL}/card-selection`;

const now = "2026-11-23T18:00:00.000Z";

export const restaurant = {
  id: RESTAURANT_ID,
  name: "Café E2E",
  logo_url: null,
  is_active: true,
  created_at: now,
  updated_at: now,
};

/** 2 × Café americano de $58 + 1 × Pan de elote de $45.50 = $161.50 */
export const retailOrder = {
  id: ORDER_ID,
  restaurant_id: RESTAURANT_ID,
  branch_number: BRANCH_NUMBER,
  branch_id: "b0b0b0b0-0000-4000-8000-000000000002",
  total_amount: 161.5,
  status: "pending" as "pending" | "paid" | "cancelled",
  folio: "007",
  paid_at: null as string | null,
  cancelled_at: null,
  created_at: now,
  en_cobro: false,
  items: [
    { id: "d1", item: "Café americano", quantity: 2, price: 58, extra_price: 0, images: [], custom_fields: [] },
    { id: "d2", item: "Pan de elote", quantity: 1, price: 45.5, extra_price: 0, images: [], custom_fields: [] },
  ],
};

export interface RetailApiOptions {
  /** Orden activa de la sucursal; null = "Esperando tu orden". */
  order?: typeof retailOrder | null;
  payments?: Omit<PaymentsApiOptions, "apiUrl">;
}

/**
 * Mock de even-backend para Retail. Lo que no tenga mock lo aborta el guard de
 * red de `@even/e2e`. `transactions` guarda los cuerpos de /payment-transactions;
 * al registrar el pago la orden pasa a pagada, como hace el backend.
 */
export async function mockRetailApi(page: Page, { order = retailOrder, payments }: RetailApiOptions = {}) {
  let active = order ? { ...order } : null;
  let paid: typeof retailOrder | null = null;
  const transactions: Array<Record<string, unknown>> = [];

  await page.route("https://pay.ecart.com/sdk/pay.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  // Sin servidor de sockets la app sigue por HTTP (polling).
  await page.route("https://backend.e2e.test/socket.io/**", (route) => route.fulfill({ status: 503 }));

  await page.route(`${API_URL}/**`, (route, request) => {
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const method = request.method();
    const json = (body: MockResponse) => route.fulfill({ json: body });

    if (method === "GET" && /^\/restaurants\/\d+\/\d+\/complete$/.test(path)) {
      return json({ success: true, data: { restaurant } });
    }
    if (method === "GET" && /^\/retail\/restaurants\/\d+\/branches\/\d+\/active-order$/.test(path)) {
      return json({ success: true, data: active });
    }
    if (method === "GET" && path === `/retail/orders/${ORDER_ID}`) {
      return json({ success: true, data: paid ?? active ?? retailOrder });
    }
    if (method === "POST" && path === "/payment-transactions") {
      transactions.push(request.postDataJSON());
      if (active) paid = { ...active, status: "paid", paid_at: now };
      active = null;
      return route.fulfill({ status: 201, json: { success: true, transaction: { id: "tx_e2e_1" } } });
    }
    if (method === "POST" && /^\/payments\/(apple|google)-pay\/order$/.test(path)) {
      return route.fulfill({ status: 503, json: { success: false, error: "Servicio no disponible" } });
    }
    if (method === "POST" && path === "/guests/register") {
      return json({ success: true, data: {} });
    }
    return route.fallback();
  });

  const paymentsApi = await mockPaymentsApi(page, { ...payments, apiUrl: API_URL });
  return { paymentsApi, transactions };
}

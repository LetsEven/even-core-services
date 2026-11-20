// Contrato del cobro de Tap & Pay tal como se arma HOY (Fase 4.0). Cualquier
// refactor de pagos (buildChargeRequest, toTransactionRecord, MSI, propina...)
// debe dejar estos cuerpos idénticos. Hoy TP NO manda `service` (el backend lo
// deduce de `id_tap_pay_order`; ver audit R1): no se cambia en la Fase 4.
import { expect, test } from "@even/e2e";
import type { Page } from "@playwright/test";
import { API_URL, CARD_SELECTION_URL, ORDER_ID, RESTAURANT_ID, TABLE, mockTapAndPayApi } from "./mocks";

const dyn = {
  orderId: ORDER_ID,
  intentKey: expect.stringMatching(/^[\w-]{16,}$/),
  fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
};
const GUEST = expect.stringMatching(/^guest-/);
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

const URL_WITH_TIP =
  `/${RESTAURANT_ID}/2/card-selection?table=${TABLE}&type=full-bill&amount=396&baseAmount=360&tipAmount=36`;

/** Responde a los endpoints que TP llama tras el cobro y guarda sus cuerpos. */
async function mockAfterCharge(page: Page) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.route(`${API_URL}/tap-pay/orders/*/pay-*`, (route, request) => {
    calls.push({ path: new URL(request.url()).pathname.replace(/^\/api/, ""), body: request.postDataJSON() });
    return route.fulfill({ json: { success: true, data: {} } });
  });
  await page.route(`${API_URL}/payment-transactions`, (route, request) => {
    calls.push({ path: "/payment-transactions", body: request.postDataJSON() });
    return route.fulfill({ json: { success: true, data: {} } });
  });
  await page.route(`${API_URL}/invoices/**`, (route) =>
    route.fulfill({ status: 404, json: { success: false, error: "sin factura" } }),
  );
  return calls;
}

const charges = (api: Awaited<ReturnType<typeof mockTapAndPayApi>>) =>
  api.requests.filter((r) => r.method === "POST" && r.path === "/payments");

async function pay(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByText("**** 4242")).toBeVisible();
  await page.getByText("**** 4242").click();
  await page.getByRole("button", { name: /^Pagar/ }).click();
}

test("POST /payments, pay-amount y /payment-transactions: base y propina reales, sin comisión de cliente", async ({
  page,
}) => {
  test.slow();
  const api = await mockTapAndPayApi(page);
  const calls = await mockAfterCharge(page);
  await pay(page, URL_WITH_TIP);
  await expect.poll(() => calls.length, { timeout: 30_000 }).toBe(2);

  expect(charges(api)).toHaveLength(1);
  // 0 % cliente: amount = 360 + 36. No hay `service` (hoy) y la orden va en id_tap_pay_order.
  expect(charges(api)[0].body).toEqual({
    paymentMethodId: "pm_visa_4242",
    amount: 396,
    currency: "MXN",
    description: "Even Tap & Pay - Mesa 1",
    ...dyn,
    orderId: ORDER_ID,
    tableNumber: "1",
    restaurantId: "5",
    baseAmount: 360,
    tipAmount: 36,
    id_tap_pay_order: ORDER_ID,
    payment_type: "full-bill",
  });
  const payAmount = calls.find((c) => c.path === `/tap-pay/orders/${ORDER_ID}/pay-amount`);
  expect(payAmount?.body).toEqual({
    amount: 360,
    tipAmount: 36,
    guestId: expect.anything(),
    guestName: expect.anything(),
    paymentSource: null,
  });
  const record = calls.find((c) => c.path === "/payment-transactions");
  expect(record?.body).toEqual({
    payment_method_id: "pm_visa_4242",
    restaurant_id: 5,
    id_tap_pay_order: ORDER_ID,
    ecartpay_order_id: "pay_e2e_1",
    base_amount: 360,
    tip_amount: 36,
    iva_tip: 5.76,
    even_commission_total: 15.84,
    even_commission_client: 0,
    even_commission_restaurant: 15.84,
    iva_even_client: 0,
    iva_even_restaurant: 2.5344,
    even_client_charge: 0,
    even_restaurant_charge: 18.3744, // TP lo recalcula a mano y no lo redondea
    even_rate_applied: 4,
    total_amount_charged: 396,
    subtotal_for_commission: 396,
    currency: "MXN",
    transaction_by: expect.any(String),
    payment_source: "saved_card",
  });
});

test("MSI: /payments manda el monto SIN financiamiento; el total financiado va a /payment-transactions", async ({
  page,
}) => {
  test.slow();
  const api = await mockTapAndPayApi(page, {
    payments: {},
  });
  api.override("GET /payments/installment-config", {
    success: true,
    data: { isActive: true, visaMc: [{ months: 6, rate: 7.5, minAmount: 300, fixedInstallments: true }], amex: [] },
  });
  const calls = await mockAfterCharge(page);
  await page.goto(URL_WITH_TIP);
  await expect(page.getByText("**** 4242")).toBeVisible();
  await page.getByText("**** 4242").click();
  await page.getByText("Pago a meses").click();
  // 396 / (1 - 0.075 * 1.16) = 433.73
  await expect(page.getByText("Total $433.73 MXN")).toBeVisible();
  await page.getByText("6 meses", { exact: true }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.getByRole("button", { name: /^Pagar/ }).click();
  await expect.poll(() => calls.length, { timeout: 30_000 }).toBe(2);

  expect(charges(api)[0].body).toEqual({
    paymentMethodId: "pm_visa_4242",
    amount: 396,
    currency: "MXN",
    description: "Even Tap & Pay - Mesa 1",
    ...dyn,
    orderId: ORDER_ID,
    tableNumber: "1",
    restaurantId: "5",
    installments: 6,
    baseAmount: 360,
    tipAmount: 36,
    id_tap_pay_order: ORDER_ID,
    payment_type: "full-bill",
  });
  const record = calls.find((c) => c.path === "/payment-transactions");
  expect(record?.body.total_amount_charged).toBeCloseTo(396 / (1 - 0.075 * 1.16), 10);
  expect(record?.body.base_amount).toBe(360);
  expect(record?.body.tip_amount).toBe(36);
});

test("las órdenes de Apple y Google Pay no mandan `service` ni precio inflado", async ({ page }) => {
  const walletBodies: Record<string, Array<Record<string, unknown>>> = { apple: [], google: [] };
  page.on("request", (r) => {
    const m = r.url().match(/\/payments\/(apple|google)-pay\/order$/);
    if (m && r.method() === "POST") walletBodies[m[1]].push(r.postDataJSON());
  });
  await mockTapAndPayApi(page);
  await page.goto(URL_WITH_TIP);
  await expect(page.getByText("**** 4242")).toBeVisible();
  await expect.poll(() => walletBodies.apple.length > 0 && walletBodies.google.length > 0).toBe(true);

  // Hoy TP NO manda `service` en las órdenes de wallet; base y propina reales, sin items.
  for (const body of [...walletBodies.apple, ...walletBodies.google]) {
    expect(body).toEqual({
      amount: 396,
      currency: "MXN",
      restaurantId: "5",
      baseAmount: 360,
      tipAmount: 36,
      payment_type: "full-bill",
    });
  }
});

test.describe("propina de Tap & Pay: no se redondea antes de calcular", () => {
  // choose-amount $20.90 + 15 %: propina cruda 3.135 (TOP/FB la redondean a centavos).
  test("15% sobre $20.90 -> tipAmount de la URL", async ({ page }) => {
    await mockTapAndPayApi(page);
    await page.goto(`/${RESTAURANT_ID}/2/tip-selection?table=${TABLE}&type=choose-amount&amount=20.9`);
    await page.getByRole("button", { name: "15%", exact: true }).click();
    await expect(page.locator("body")).toContainText("$24.03");
    await page.getByRole("button", { name: "Pagar" }).click();
    // Propina cruda en la URL (3.135): TP no la redondea a centavos.
    await expect(page).toHaveURL(/card-selection\?type=choose-amount&amount=24\.03&baseAmount=20\.9&tipAmount=3\.135&/);
  });
});

test.describe("máquina de estados de la tarjeta guardada", () => {
  test("payment_in_progress: solo polling del intent, nunca un segundo /payments", async ({ page }) => {
    test.slow();
    const api = await mockTapAndPayApi(page, {
      payments: {
        processPayment: { status: 409, body: { success: false, code: "payment_in_progress" } },
        intentStatus: { success: true, status: "charged", ecartpay_order_id: "ecart_polled_1" },
      },
    });
    const calls = await mockAfterCharge(page);
    await pay(page, URL_WITH_TIP);
    await expect.poll(() => calls.length, { timeout: 30_000 }).toBe(2);
    expect(calls.find((c) => c.path === "/payment-transactions")?.body.ecartpay_order_id).toBe("ecart_polled_1");
    expect(charges(api)).toHaveLength(1);
    expect(api.requests.some((r) => r.method === "GET" && r.path.startsWith("/payments/intents/"))).toBe(true);
  });

  for (const code of ["payment_unknown", "charge_unconfirmed"]) {
    test(`${code}: terminal, no ofrece reintentar, conserva el intento y no registra el pago`, async ({ page }) => {
      test.slow();
      const api = await mockTapAndPayApi(page, {
        payments: { processPayment: { status: 502, body: { success: false, code } } },
      });
      const calls = await mockAfterCharge(page);
      await pay(page, URL_WITH_TIP);
      await expect(page.getByText("No pudimos confirmar tu pago")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toHaveCount(0);
      expect(await page.evaluate(() => sessionStorage.getItem("even-payment-intent"))).not.toBeNull();
      expect(calls).toHaveLength(0);
      expect(charges(api)).toHaveLength(1);
    });
  }

  test("intent_mismatch descarta el intento y deja reintentar", async ({ page }) => {
    test.slow();
    await mockTapAndPayApi(page, {
      payments: { processPayment: { status: 409, body: { success: false, code: "intent_mismatch" } } },
    });
    await mockAfterCharge(page);
    await pay(page, URL_WITH_TIP);
    await expect(page.getByText("Tu pedido cambió")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => sessionStorage.getItem("even-payment-intent"))).toBeNull();
    await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toBeVisible();
  });
});

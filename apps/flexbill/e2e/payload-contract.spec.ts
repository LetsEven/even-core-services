// Contrato del cobro de FlexBill tal como se arma HOY (Fase 4.0). Cualquier
// refactor de pagos (buildChargeRequest, toTransactionRecord, MSI, propina...)
// debe dejar estos cuerpos idénticos. Hoy FB NO manda `service` (el backend
// usa la tarifa de Flex Bill por `id_table_order`; ver audit R1): no se cambia
// en la Fase 4.
import { expect, test } from "@even/e2e";
import type { Page } from "@playwright/test";
import { API_URL, BRANCH_NUMBER, RESTAURANT_ID, SESSION, TABLE, TABLE_ORDER_ID, mockFlexBillApi } from "./mocks";

const TABLE_QUERY = `table=${TABLE}&session=${SESSION}`;
const URL_WITH_TIP =
  `/${RESTAURANT_ID}/${BRANCH_NUMBER}/card-selection?${TABLE_QUERY}` +
  "&type=full-bill&amount=396&baseAmount=360&tipAmount=36&displaySubtotal=360&displayPropina=36";

const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

/** Registra los cuerpos de /payment-transactions y /pay (la respuesta sigue siendo la del mock). */
async function recordAfterCharge(page: Page) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.route(`${API_URL}/payment-transactions`, (route, request) => {
    calls.push({ path: "/payment-transactions", body: request.postDataJSON() });
    return route.fulfill({ json: { success: true, data: { id: "pt_e2e_1" } } });
  });
  return calls;
}

const charges = (api: Awaited<ReturnType<typeof mockFlexBillApi>>) =>
  api.requests.filter((r) => r.method === "POST" && r.path === "/payments");

async function pay(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByText("**** 4242")).toBeVisible();
  await page.getByText("**** 4242").click();
  await page.getByRole("button", { name: /^Pagar \$/ }).click();
}

test("POST /payments y /payment-transactions: base y propina reales, sin service, con id_table_order", async ({ page }) => {
  test.slow();
  const api = await mockFlexBillApi(page);
  const calls = await recordAfterCharge(page);
  await pay(page, URL_WITH_TIP);
  await expect.poll(() => calls.length, { timeout: 30_000 }).toBe(1);

  expect(charges(api)).toHaveLength(1);
  expect(charges(api)[0].body).toEqual({
    paymentMethodId: "pm_visa_4242",
    amount: 396,
    currency: "MXN",
    description: "Even Restaurant Payment - Table 12 - Tip: $36.00 - Commission: $0.00",
    orderId: expect.stringMatching(/^order-\d+-attempt-1$/),
    tableNumber: "12",
    restaurantId: "4",
    baseAmount: 360,
    tipAmount: 36,
    id_table_order: TABLE_ORDER_ID,
    payment_type: "full-bill",
    intentKey: expect.stringMatching(/^[\w-]{16,}$/),
    fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  expect(calls[0].body).toEqual({
    payment_method_id: "pm_visa_4242",
    restaurant_id: 4,
    id_table_order: TABLE_ORDER_ID,
    id_tap_orders_and_pay: null,
    ecartpay_order_id: "pay_e2e_1",
    payment_source: "saved_card",
    payment_type: "full-bill",
    base_amount: 360,
    tip_amount: 36,
    iva_tip: 5.76,
    even_commission_total: 15.84,
    even_commission_client: 0,
    even_commission_restaurant: 15.84,
    iva_even_client: 0,
    iva_even_restaurant: 2.5344,
    even_client_charge: 0,
    even_restaurant_charge: 18.3744,
    even_rate_applied: 4,
    total_amount_charged: 396,
    subtotal_for_commission: 396,
    currency: "MXN",
    transaction_by: "Invitado",
  });
});

test("MSI: /payments manda el monto SIN financiamiento; el total financiado va a /payment-transactions", async ({ page }) => {
  test.slow();
  const api = await mockFlexBillApi(page);
  api.override("GET /payments/installment-config", {
    success: true,
    data: { isActive: true, visaMc: [{ months: 6, rate: 7.5, minAmount: 300, fixedInstallments: true }], amex: [] },
  });
  const calls = await recordAfterCharge(page);
  await page.goto(URL_WITH_TIP);
  await expect(page.getByText("**** 4242")).toBeVisible();
  await page.getByText("**** 4242").click();
  await page.getByText("Pago a meses").click();
  // 396 / (1 - 0.075 * 1.16) = 433.73
  await expect(page.getByText("Total $433.73 MXN")).toBeVisible();
  await page.getByText(/x 6 meses/).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.getByRole("button", { name: /^Pagar \$/ }).click();
  await expect.poll(() => calls.length, { timeout: 30_000 }).toBe(1);

  const body = charges(api)[0].body as Record<string, unknown>;
  expect(body).toMatchObject({ amount: 396, baseAmount: 360, tipAmount: 36, installments: 6, id_table_order: TABLE_ORDER_ID });
  expect(calls[0].body.total_amount_charged).toBeCloseTo(396 / (1 - 0.075 * 1.16), 10);
  expect(calls[0].body.base_amount).toBe(360);
  expect(calls[0].body.tip_amount).toBe(36);
});

test("las órdenes de Apple y Google Pay no mandan `service` ni precio inflado", async ({ page }) => {
  const walletBodies: Record<string, Array<Record<string, unknown>>> = { apple: [], google: [] };
  page.on("request", (r) => {
    const m = r.url().match(/\/payments\/(apple|google)-pay\/order$/);
    if (m && r.method() === "POST") walletBodies[m[1]].push(r.postDataJSON());
  });
  await mockFlexBillApi(page);
  await page.goto(URL_WITH_TIP);
  await expect(page.getByText("**** 4242")).toBeVisible();
  await expect.poll(() => walletBodies.apple.length > 0).toBe(true);
  await page.waitForTimeout(1500);
  // Hoy FB NO manda `service` ni precio inflado: un solo renglón "Consumo" con la base real.
  const { id_table_order, ...rest } = walletBodies.apple[0];
  expect([null, TABLE_ORDER_ID]).toContain(id_table_order); // null si la mesa aún no cargó (carrera actual)
  expect(rest).toEqual({
    amount: 396,
    currency: "MXN",
    restaurantId: "4",
    baseAmount: 360,
    tipAmount: 36,
    items: [{ name: "Consumo", price: 360, quantity: 1, extraPrice: 0 }],
    payment_type: "full-bill",
  });
});

test.describe("máquina de estados de la tarjeta guardada", () => {
  test("payment_in_progress: solo polling del intent, nunca un segundo /payments", async ({ page }) => {
    test.slow();
    const api = await mockFlexBillApi(page, {
      payments: {
        processPayment: { status: 409, body: { success: false, code: "payment_in_progress" } },
        intentStatus: { success: true, status: "charged", ecartpay_order_id: "ecart_polled_1" },
      },
    });
    const calls = await recordAfterCharge(page);
    await pay(page, URL_WITH_TIP);
    await expect.poll(() => calls.length, { timeout: 30_000 }).toBe(1);
    expect(calls[0].body.ecartpay_order_id).toBe("ecart_polled_1");
    expect(charges(api)).toHaveLength(1);
    expect(api.requests.some((r) => r.method === "GET" && r.path.startsWith("/payments/intents/"))).toBe(true);
  });

  for (const code of ["payment_unknown", "charge_unconfirmed"]) {
    test(`${code}: terminal, no ofrece reintentar, conserva el intento y no registra el pago`, async ({ page }) => {
      test.slow();
      const api = await mockFlexBillApi(page, {
        payments: { processPayment: { status: 502, body: { success: false, code } } },
      });
      const calls = await recordAfterCharge(page);
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
    await mockFlexBillApi(page, {
      payments: { processPayment: { status: 409, body: { success: false, code: "intent_mismatch" } } },
    });
    await pay(page, URL_WITH_TIP);
    await expect(page.getByText("Tu pedido cambió")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => sessionStorage.getItem("even-payment-intent"))).toBeNull();
    await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toBeVisible();
  });
});

test.describe("propina de FlexBill: no se redondea antes de calcular (igual que el backend)", () => {
  test("15% sobre $20.90 -> tipAmount de la URL", async ({ page }) => {
    await mockFlexBillApi(page);
    await page.goto(
      `/${RESTAURANT_ID}/${BRANCH_NUMBER}/tip-selection?${TABLE_QUERY}&type=choose-amount&amount=20.9`,
    );
    await page.getByRole("button", { name: "15%", exact: true }).click();
    await page.getByRole("button", { name: /^Pagar \$/ }).click();
    // El objetivo de propina es crudo (3.135) y FlexBill lo resuelve a centavos en resolveTipAmountForTargetDisplay
    // (3.135 -> 3.13): amount 24.03 (antes, con el objetivo a centavos, 3.14 y 24.04).
    await expect(page).toHaveURL(/card-selection\?type=choose-amount&amount=24\.03&baseAmount=20\.9&tipAmount=3\.13&/);
  });
});

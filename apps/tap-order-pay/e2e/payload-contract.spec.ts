// Contrato del cobro de Tap Order & Pay tal como se arma HOY (Fase 4.0).
// Cualquier refactor de pagos (buildChargeRequest, useSavedCardCharge, MSI,
// propina...) debe dejar estos cuerpos y comportamientos idénticos: sin precio
// inflado, sin comisión en base/tip, `service` fijo, mismos reintentos.
import { expect, test } from "@even/e2e";
import type { Page } from "@playwright/test";
import { API_URL, CARD_SELECTION_URL, cartWithClubSandwich, mockTopApi } from "./mocks";

const order = { id: "top_order_1", status: "pending" };
const confirmed = { success: true, data: { order } };
const dyn = {
  orderId: expect.stringMatching(/^order-\d+$/),
  intentKey: expect.stringMatching(/^[\w-]{16,}$/),
  fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
};
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const GUEST = expect.stringMatching(/^guest-/);

type Reply = { status?: number; body?: object } | "abort";

/** Responde a POST /tap-orders/confirm en orden (la última se repite) y guarda los cuerpos. */
async function mockConfirm(page: Page, replies: Reply[]) {
  const bodies: Array<Record<string, unknown>> = [];
  let i = 0;
  await page.route(`${API_URL}/tap-orders/confirm`, (route, request) => {
    bodies.push(request.postDataJSON());
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r === "abort") return route.abort("failed");
    return route.fulfill({ status: r.status ?? 200, json: r.body ?? confirmed });
  });
  // payment-success consulta la orden y su factura tras confirmar.
  await page.route(`${API_URL}/tap-orders/${order.id}`, (route) => route.fulfill({ json: confirmed }));
  await page.route(`${API_URL}/invoices/**`, (route) =>
    route.fulfill({ status: 404, json: { success: false, error: "sin factura" } }),
  );
  await page.route(`${API_URL}/cart`, (route, request) =>
    request.method() === "DELETE" ? route.fulfill({ json: { success: true } }) : route.fallback(),
  );
  return bodies;
}

async function pay(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByText("**** 4242")).toBeVisible();
  await page.getByRole("button", { name: "Pagar y ordenar" }).click();
}

const charges = (api: Awaited<ReturnType<typeof mockTopApi>>) =>
  api.requests.filter((r) => r.method === "POST" && r.path === "/payments");

test("POST /payments con tarjeta guardada: base y propina reales, service, sin MSI", async ({ page }) => {
  test.slow();
  const api = await mockTopApi(page, { cartItems: cartWithClubSandwich });
  const confirmBodies = await mockConfirm(page, [{}]);
  await pay(page, `${CARD_SELECTION_URL}&tipAmount=36`);
  await expect.poll(() => confirmBodies.length, { timeout: 30_000 }).toBe(1);

  expect(charges(api)).toHaveLength(1);
  // 360 + 36 de propina + 2 % con IVA sobre 396 = 396; base y tip viajan reales.
  expect(charges(api)[0].body).toEqual({
    paymentMethodId: "pm_visa_4242",
    amount: 396,
    currency: "MXN",
    description: expect.stringMatching(/^Pago Mesa 12 - /),
    ...dyn,
    orderType: "tap-order-pay",
    tableNumber: "12",
    restaurantId: "4",
    baseAmount: 360,
    tipAmount: 36,
    service: "tap-order-and-pay",
    items: [{ name: "Club sándwich", price: 180, quantity: 2, extraPrice: 0, cartItemId: "ci_e2e_1" }],
  });
  expect(confirmBodies[0]).toEqual({
    clerk_user_id: GUEST,
    guest_id: GUEST,
    user_id: GUEST,
    is_guest: true,
    customer_name: "Invitado",
    customer_email: null,
    customer_phone: null,
    restaurant_id: 4,
    branch_number: 1,
    table_number: "12",
    order_notes: null,
    items: [
      {
        item: "Club sándwich",
        price: 180,
        quantity: 2,
        images: [],
        custom_fields: null,
        extra_price: 0,
        menu_item_id: "101",
        special_instructions: null,
        user_discount_id: null,
        is_promo_item: false,
        cart_item_id: "ci_e2e_1",
      },
    ],
    // Con 0 % cliente el total es consumo + propina; la comisión (restaurante) viaja aparte.
    base_amount: 360,
    tip_amount: 36,
    total_amount_charged: 396,
    user_discount_id: null,
    promo_redemption_id: null,
    currency: "MXN",
    transaction_by: "Invitado",
    iva_tip: 5.76,
    even_commission_total: 15.84,
    even_commission_client: 0,
    even_commission_restaurant: 15.84,
    iva_even_client: 0,
    iva_even_restaurant: 2.5344,
    even_client_charge: 0,
    even_restaurant_charge: 18.37,
    even_rate_applied: 4,
    payment_method_id: "pm_visa_4242",
    payment_source: "saved_card",
    ecartpay_order_id: "pay_e2e_1",
    installments: null,
  });
});

test("MSI: /payments manda el monto SIN financiamiento, sin items y con installments; total_amount_charged financiado en /confirm", async ({
  page,
}) => {
  test.slow();
  const api = await mockTopApi(page, {
    cartItems: cartWithClubSandwich,
    msi: { isActive: true, visaMc: [{ months: 6, rate: 7.5, minAmount: 300, fixedInstallments: true }], amex: [] },
  });
  // /confirm falla (500) para que el intento siga guardado y se pueda leer su monto.
  const confirmBodies = await mockConfirm(page, [{ status: 500, body: { success: false } }]);
  await page.goto(`${CARD_SELECTION_URL}&tipAmount=36`);
  await expect(page.getByText("**** 4242")).toBeVisible();
  await page.getByText("Pago a meses").click();
  // 396 / (1 - 0.075 * 1.16) = 433.73
  await expect(page.getByText("Total $433.73 MXN")).toBeVisible();
  await page.getByText("x 6 meses").click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.getByRole("button", { name: "Pagar y ordenar" }).click();
  await expect.poll(() => confirmBodies.length, { timeout: 30_000 }).toBe(1);

  const body = charges(api)[0].body as Record<string, unknown>;
  expect(body).toEqual({
    paymentMethodId: "pm_visa_4242",
    amount: 396,
    currency: "MXN",
    description: expect.stringMatching(/^Pago Mesa 12 - /),
    ...dyn,
    orderType: "tap-order-pay",
    tableNumber: "12",
    restaurantId: "4",
    installments: 6,
    baseAmount: 360,
    tipAmount: 36,
    service: "tap-order-and-pay",
  });
  expect(body.items).toBeUndefined();
  expect(confirmBodies[0].total_amount_charged).toBeCloseTo(396 / (1 - 0.075 * 1.16), 10);
  expect(confirmBodies[0].base_amount).toBe(360);
  expect(confirmBodies[0].tip_amount).toBe(36);
  // El intento (fingerprint) se calcula con el total financiado, sin redondear: lo guarda `amount`.
  const intent = await page.evaluate(() => JSON.parse(sessionStorage.getItem("even-payment-intent") ?? "null"));
  expect(intent?.amount).toBeCloseTo(396 / (1 - 0.075 * 1.16), 10);
});

test("las órdenes de Apple y Google Pay se arman sin precio inflado ni comisión en base/propina", async ({ page }) => {
  const walletBodies: Record<string, unknown[]> = { apple: [], google: [] };
  page.on("request", (r) => {
    const m = r.url().match(/\/payments\/(apple|google)-pay\/order$/);
    if (m && r.method() === "POST") walletBodies[m[1]].push(r.postDataJSON());
  });
  await mockTopApi(page, { cartItems: cartWithClubSandwich });
  await page.goto(`${CARD_SELECTION_URL}&tipAmount=0`);
  await expect(page.getByText("**** 4242")).toBeVisible();
  await expect.poll(() => walletBodies.apple.length > 0 && walletBodies.google.length > 0).toBe(true);

  const expected = {
    amount: 360,
    currency: "MXN",
    restaurantId: "4",
    baseAmount: 360,
    tipAmount: 0,
    items: [{ name: "Club sándwich", price: 180, quantity: 2, extraPrice: 0, cartItemId: "ci_e2e_1" }],
    // TOP es la única de PG/RS/TOP que manda `service` en las órdenes de wallet.
    service: "tap-order-and-pay",
  };
  await expect.poll(() => walletBodies.apple.some((b) => canon(b) === canon(expected))).toBe(true);
  await expect.poll(() => walletBodies.google.some((b) => canon(b) === canon(expected))).toBe(true);
});

test.describe("reintentos de /confirm de Tap Order & Pay: superconjunto transitorio (conflict, red, 429, 5xx)", () => {
  const cases: Array<{ name: string; reply: Reply; calls: number; ok: boolean }> = [
    { name: "500 se reintenta", reply: { status: 500, body: { success: false } }, calls: 2, ok: true },
    { name: "503 se reintenta", reply: { status: 503, body: { success: false } }, calls: 2, ok: true },
    { name: "429 se reintenta", reply: { status: 429, body: { success: false } }, calls: 2, ok: true },
    { name: "409 confirm_conflict se reintenta", reply: { status: 409, body: { success: false, code: "confirm_conflict" } }, calls: 2, ok: true },
    { name: "409 confirm_in_progress se reintenta", reply: { status: 409, body: { success: false, code: "confirm_in_progress" } }, calls: 2, ok: true },
    { name: "red caída se reintenta", reply: "abort", calls: 2, ok: true },
    { name: "402 payment_required no se reintenta", reply: { status: 402, body: { success: false, code: "payment_required" } }, calls: 1, ok: false },
    { name: "404 order_not_found no se reintenta", reply: { status: 404, body: { success: false, code: "order_not_found" } }, calls: 1, ok: false },
    { name: "409 payment_amount_mismatch no se reintenta", reply: { status: 409, body: { success: false, code: "payment_amount_mismatch" } }, calls: 1, ok: false },
  ];
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      test.slow();
      const api = await mockTopApi(page, { cartItems: cartWithClubSandwich });
      const bodies = await mockConfirm(page, [c.reply, {}]);
      await pay(page, `${CARD_SELECTION_URL}&tipAmount=36`);
      if (c.ok) {
        await expect.poll(() => bodies.length, { timeout: 30_000 }).toBe(2);
        // Mismo ecartpay_order_id en cada intento; /payments una sola vez.
        expect(new Set(bodies.map((b) => b.ecartpay_order_id))).toEqual(new Set(["pay_e2e_1"]));
      } else {
        await expect(page.getByText("No pudimos confirmar tu pago")).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(4000);
        // Cobrado sin confirmar: nunca se ofrece reintentar el cobro y el intento sigue guardado.
        await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toHaveCount(0);
        expect(await page.evaluate(() => sessionStorage.getItem("even-payment-intent"))).not.toBeNull();
      }
      expect(bodies).toHaveLength(c.calls);
      expect(charges(api)).toHaveLength(1);
    });
  }
});

test.describe("máquina de estados de la tarjeta guardada", () => {
  test("payment_in_progress: solo polling del intent, nunca un segundo /payments", async ({ page }) => {
    test.slow();
    const api = await mockTopApi(page, {
      cartItems: cartWithClubSandwich,
      payments: {
        processPayment: { status: 409, body: { success: false, code: "payment_in_progress" } },
        intentStatus: { success: true, status: "charged", ecartpay_order_id: "ecart_polled_1" },
      },
    });
    const bodies = await mockConfirm(page, [{}]);
    await pay(page, `${CARD_SELECTION_URL}&tipAmount=36`);
    await expect.poll(() => bodies.length, { timeout: 30_000 }).toBe(1);
    expect(bodies[0].ecartpay_order_id).toBe("ecart_polled_1");
    expect(charges(api)).toHaveLength(1);
    expect(api.requests.some((r) => r.method === "GET" && r.path.startsWith("/payments/intents/"))).toBe(true);
  });

  for (const code of ["payment_unknown", "charge_unconfirmed"]) {
    test(`${code}: terminal, no ofrece reintentar, conserva el intento y no confirma`, async ({ page }) => {
      test.slow();
      const api = await mockTopApi(page, {
        cartItems: cartWithClubSandwich,
        payments: { processPayment: { status: 502, body: { success: false, code } } },
      });
      const bodies = await mockConfirm(page, [{}]);
      await pay(page, `${CARD_SELECTION_URL}&tipAmount=36`);
      await expect(page.getByText("No pudimos confirmar tu pago")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toHaveCount(0);
      expect(await page.evaluate(() => sessionStorage.getItem("even-payment-intent"))).not.toBeNull();
      expect(bodies).toHaveLength(0);
      expect(charges(api)).toHaveLength(1);
    });
  }

  test("intent_mismatch descarta el intento y deja reintentar", async ({ page }) => {
    test.slow();
    await mockTopApi(page, {
      cartItems: cartWithClubSandwich,
      payments: { processPayment: { status: 409, body: { success: false, code: "intent_mismatch" } } },
    });
    await mockConfirm(page, [{}]);
    await pay(page, `${CARD_SELECTION_URL}&tipAmount=36`);
    await expect(page.getByText("Tu pedido cambió")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => sessionStorage.getItem("even-payment-intent"))).toBeNull();
    await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toBeVisible();
  });

  test("idempotency_unavailable deja reintentar y conserva el intento", async ({ page }) => {
    test.slow();
    await mockTopApi(page, {
      cartItems: cartWithClubSandwich,
      payments: { processPayment: { status: 503, body: { success: false, code: "idempotency_unavailable" } } },
    });
    await mockConfirm(page, [{}]);
    await pay(page, `${CARD_SELECTION_URL}&tipAmount=36`);
    await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => sessionStorage.getItem("even-payment-intent"))).not.toBeNull();
  });
});

test.describe("propina de Tap Order & Pay: no se redondea antes de calcular (igual que el backend)", () => {
  // $20.90 de consumo, 15 %: propina cruda 3.135. El total mostrado depende de si la propina se redondea
  // antes de calcular la comisión (ninguna app la redondea; solo el total final).
  const cart = [{ id: "ci_e2e_2", menu_item_id: 101, name: "Club sándwich", price: 20.9, quantity: 1 }];
  test("15% -> total y tipAmount de la URL", async ({ page }) => {
    await mockTopApi(page, { cartItems: cart });
    await page.goto("/4/1/order-confirm?table=12");
    await page.getByRole("button", { name: "15%", exact: true }).click();
    await expect(page.locator("body")).toContainText("$24.03");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page).toHaveURL(/card-selection\?tipAmount=3.13&/);
  });
});

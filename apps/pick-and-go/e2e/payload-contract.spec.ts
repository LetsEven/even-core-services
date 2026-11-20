// Contrato del cobro de Pick & Go tal como se arma HOY (Fase 4.0).
// Cualquier refactor de pagos (buildChargeRequest, useSavedCardCharge, MSI,
// propina...) debe dejar estos cuerpos y comportamientos idénticos: sin precio
// inflado, sin comisión en base/tip, `service` fijo, mismos reintentos.
import { expect, test } from "@even/e2e";
import type { Page } from "@playwright/test";
import { API_URL, CARD_SELECTION_URL, cartWithClubSandwich, mockPickAndGoApi } from "./mocks";

const order = { id: "pg_order_1", status: "pending" };
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

/** Responde a POST /pick-and-go/orders/confirm en orden (la última se repite) y guarda los cuerpos. */
async function mockConfirm(page: Page, replies: Reply[]) {
  const bodies: Array<Record<string, unknown>> = [];
  let i = 0;
  await page.route(`${API_URL}/pick-and-go/orders/confirm`, (route, request) => {
    bodies.push(request.postDataJSON());
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r === "abort") return route.abort("failed");
    return route.fulfill({ status: r.status ?? 200, json: r.body ?? confirmed });
  });
  // payment-success consulta la orden y su factura tras confirmar.
  await page.route(`${API_URL}/pick-and-go/orders/${order.id}`, (route) => route.fulfill({ json: confirmed }));
  await page.route(`${API_URL}/invoices/**`, (route) =>
    route.fulfill({ status: 404, json: { success: false, error: "sin factura" } }),
  );
  await page.route(`${API_URL}/cart/notes`, (route) => route.fulfill({ json: { success: true } }));
  await page.route(`${API_URL}/cart`, (route, request) =>
    request.method() === "DELETE" ? route.fulfill({ json: { success: true } }) : route.fallback(),
  );
  return bodies;
}

async function pay(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByText("•••• 4242")).toBeVisible();
  await page.getByRole("button", { name: /^Pagar \$/ }).click();
}

const charges = (api: Awaited<ReturnType<typeof mockPickAndGoApi>>) =>
  api.requests.filter((r) => r.method === "POST" && r.path === "/payments");

test("POST /payments con tarjeta guardada: base y propina reales, service, sin MSI", async ({ page }) => {
  test.slow();
  const api = await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
  const confirmBodies = await mockConfirm(page, [{}]);
  await pay(page, `${CARD_SELECTION_URL}&tipAmount=36`);
  await expect.poll(() => confirmBodies.length, { timeout: 30_000 }).toBe(1);

  expect(charges(api)).toHaveLength(1);
  // 360 + 36 de propina + 2 % con IVA sobre 396 = 405.19; base y tip viajan reales.
  expect(charges(api)[0].body).toEqual({
    paymentMethodId: "pm_visa_4242",
    amount: 405.19,
    currency: "MXN",
    description: expect.stringMatching(/^Pick & Go Order - /),
    ...dyn,
    tableNumber: "PICKUP",
    restaurantId: "4",
    baseAmount: 360,
    tipAmount: 36,
    service: "pick-and-go",
    items: [{ name: "Club sándwich", price: 180, quantity: 2, extraPrice: 0, cartItemId: "ci_e2e_1" }],
  });
  expect(confirmBodies[0]).toEqual({
    clerk_user_id: GUEST,
    customer_name: "Invitado",
    customer_email: null,
    customer_phone: null,
    restaurant_id: 4,
    branch_number: 1,
    total_amount: 405.19,
    prep_metadata: { scheduled_pickup_time: null },
    order_notes: null,
    items: [
      {
        item: "Club sándwich",
        price: 180,
        quantity: 2,
        images: [],
        customFields: null,
        extraPrice: 0,
        menuItemId: "101",
        specialInstructions: null,
        is_promo_item: false,
        user_discount_id: null,
        cart_item_id: "ci_e2e_1",
      },
    ],
    // Base y propina reales; la comisión viaja aparte (reglas 2 y 3).
    base_amount: 360,
    tip_amount: 36,
    iva_tip: 5.76,
    even_commission_total: 15.84,
    even_commission_client: 7.92,
    even_commission_restaurant: 7.92,
    iva_even_client: 1.2672,
    iva_even_restaurant: 1.2672,
    even_client_charge: 9.19,
    even_restaurant_charge: 9.19,
    even_rate_applied: 4,
    total_amount_charged: 405.19,
    transaction_by: "Invitado",
    is_guest: true,
    user_id: GUEST,
    user_discount_id: null,
    promo_redemption_id: null,
    payment_method_id: "pm_visa_4242",
    payment_source: "saved_card",
    ecartpay_order_id: "pay_e2e_1",
    session_data: {
      source: "card-selection",
      payment_method_id: "pm_visa_4242",
      total_amount: 405.19,
      base_amount: 360,
      tip_amount: 36,
    },
  });
});

test("MSI: /payments manda el monto SIN financiamiento, sin items y con installments; total_amount_charged financiado en /confirm", async ({
  page,
}) => {
  test.slow();
  const api = await mockPickAndGoApi(page, {
    cartItems: cartWithClubSandwich,
    payments: { },
  });
  api.override("GET /payments/installment-config", {
    success: true,
    data: { isActive: true, visaMc: [{ months: 6, rate: 7.5, minAmount: 300, fixedInstallments: true }], amex: [] },
  });
  // /confirm falla (500) para que el intento siga guardado y se pueda leer su monto.
  const confirmBodies = await mockConfirm(page, [{ status: 500, body: { success: false } }]);
  await page.goto(`${CARD_SELECTION_URL}&tipAmount=36`);
  await expect(page.getByText("•••• 4242")).toBeVisible();
  await page.getByText("Pago a meses").click();
  // 405.19 / (1 - 0.075 * 1.16) = 443.80
  await expect(page.getByText("Total $443.80 MXN")).toBeVisible();
  await page.getByText("x 6 meses").click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await page.getByRole("button", { name: /^Pagar \$/ }).click();
  await expect.poll(() => confirmBodies.length, { timeout: 30_000 }).toBe(1);

  const body = charges(api)[0].body as Record<string, unknown>;
  expect(body).toEqual({
    paymentMethodId: "pm_visa_4242",
    amount: 405.19,
    currency: "MXN",
    description: expect.stringMatching(/^Pick & Go Order - /),
    ...dyn,
    tableNumber: "PICKUP",
    restaurantId: "4",
    installments: 6,
    baseAmount: 360,
    tipAmount: 36,
    service: "pick-and-go",
  });
  expect(body.items).toBeUndefined();
  expect(confirmBodies[0].total_amount_charged).toBeCloseTo(405.19 / (1 - 0.075 * 1.16), 10);
  expect(confirmBodies[0].base_amount).toBe(360);
  expect(confirmBodies[0].tip_amount).toBe(36);
  // El intento (fingerprint) se calcula con el total financiado, sin redondear: lo guarda `amount`.
  const intent = await page.evaluate(() => JSON.parse(sessionStorage.getItem("even-payment-intent") ?? "null"));
  expect(intent?.amount).toBeCloseTo(405.19 / (1 - 0.075 * 1.16), 10);
});

test("la orden de Apple Pay se arma sin precio inflado ni comisión en base/propina (Google Pay apagado)", async ({ page }) => {
  const walletBodies: Record<string, unknown[]> = { apple: [], google: [] };
  page.on("request", (r) => {
    const m = r.url().match(/\/payments\/(apple|google)-pay\/order$/);
    if (m && r.method() === "POST") walletBodies[m[1]].push(r.postDataJSON());
  });
  await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
  await page.goto(`${CARD_SELECTION_URL}&tipAmount=0`);
  await expect(page.getByText("•••• 4242")).toBeVisible();
  await expect.poll(() => walletBodies.apple.length > 0).toBe(true);

  const expected = {
    amount: 368.35,
    currency: "MXN",
    restaurantId: "4",
    baseAmount: 360,
    tipAmount: 0,
    items: [{ name: "Club sándwich", price: 180, quantity: 2, extraPrice: 0, cartItemId: "ci_e2e_1" }],
  };
  // Hoy RS NO manda `service` ni `id_*` en las órdenes de wallet (el backend cae a 2/2 = su tarifa).
  await expect.poll(() => walletBodies.apple.some((b) => canon(b) === canon(expected))).toBe(true);
  // Google Pay está deshabilitado temporalmente en Pick & Go: no se pide su orden.
  expect(walletBodies.google).toHaveLength(0);
});

test.describe("reintentos de /confirm de Pick & Go: transitorios (conflict, red, 429, 5xx), igual que el core", () => {
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
      const api = await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
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
    const api = await mockPickAndGoApi(page, {
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
      const api = await mockPickAndGoApi(page, {
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
    await mockPickAndGoApi(page, {
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
    await mockPickAndGoApi(page, {
      cartItems: cartWithClubSandwich,
      payments: { processPayment: { status: 503, body: { success: false, code: "idempotency_unavailable" } } },
    });
    await mockConfirm(page, [{}]);
    await pay(page, `${CARD_SELECTION_URL}&tipAmount=36`);
    await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => sessionStorage.getItem("even-payment-intent"))).not.toBeNull();
  });
});

test.describe("propina de Pick & Go: no se redondea antes de calcular", () => {
  // $20.90 de consumo, 15 %: propina cruda 3.135. El total mostrado depende de si la propina se redondea
  // antes de calcular la comisión (ninguna app la redondea; solo el total final).
  const cart = [{ id: "ci_e2e_2", menu_item_id: 101, name: "Club sándwich", price: 20.9, quantity: 1 }];
  test("15% -> total y tipAmount de la URL", async ({ page }) => {
    await mockPickAndGoApi(page, { cartItems: cart });
    await page.goto("/4/order-confirm?branch=1");
    await page.getByRole("button", { name: "15%", exact: true }).click();
    await expect(page.locator("body")).toContainText("$24.59");
    await page.getByRole("button", { name: /^Pagar \$/ }).click();
    await expect(page).toHaveURL(/card-selection\?tipAmount=3.13&/);
  });
});

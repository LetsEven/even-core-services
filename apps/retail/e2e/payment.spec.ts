import { expect, test } from "@even/e2e";
import { CHECKOUT_URL, ORDER_ID, mockRetailApi } from "./mocks";

const charges = (api: Awaited<ReturnType<typeof mockRetailApi>>["paymentsApi"]) =>
  api.requests.filter((r) => r.method === "POST" && r.path === "/payments");

test("cobra el total de la orden sin propina, registra el pago y abre el ticket", async ({ page }) => {
  // La animación del pago deja unos segundos antes de cobrar.
  test.slow();
  const { paymentsApi, transactions } = await mockRetailApi(page);
  await page.goto(CHECKOUT_URL);

  await expect(page.getByText("$161.50 MXN")).toBeVisible();
  await page.getByText("**** 4242").click();
  await page.getByRole("button", { name: /^Pagar/ }).click();

  await expect(page).toHaveURL(new RegExp(`/5/2/ticket/${ORDER_ID}$`), { timeout: 30_000 });
  await expect(page.getByText("¡Pago exitoso!")).toBeVisible();
  await expect(page.getByText("IVA (16%)")).toBeVisible();

  expect(charges(paymentsApi)).toHaveLength(1);
  expect(charges(paymentsApi)[0].body).toMatchObject({
    paymentMethodId: "pm_visa_4242",
    amount: 161.5,
    baseAmount: 161.5,
    tipAmount: 0,
    service: "retail",
    id_retail_order: ORDER_ID,
    restaurantId: "5",
  });

  expect(transactions).toHaveLength(1);
  expect(transactions[0]).toMatchObject({
    id_retail_order: ORDER_ID,
    base_amount: 161.5,
    tip_amount: 0,
    total_amount_charged: 161.5,
    even_client_charge: 0,
    payment_source: "saved_card",
  });
});

test("un rechazo de la tarjeta deja reintentar con otra", async ({ page }) => {
  test.slow();
  const { paymentsApi } = await mockRetailApi(page, {
    payments: {
      processPayment: {
        status: 422,
        body: { success: false, code: "payment_rejected", error: "La tarjeta fue rechazada por el banco" },
      },
    },
  });
  await page.goto(CHECKOUT_URL);

  await page.getByText("**** 4242").click();
  await page.getByRole("button", { name: /^Pagar/ }).click();
  await expect(page.getByText("La tarjeta fue rechazada por el banco")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /intentar de nuevo/i }).click();
  await page.getByText("**** 5454").click();
  await page.getByRole("button", { name: /^Pagar/ }).click();
  await expect.poll(() => charges(paymentsApi).length, { timeout: 20_000 }).toBe(2);
});

test("si crew editó la orden antes del cobro, no cobra y regresa a la orden", async ({ page }) => {
  test.slow();
  await mockRetailApi(page, {
    payments: {
      processPayment: {
        status: 409,
        body: { success: false, code: "order_changed", error: "La orden cambió. Revisa el total antes de pagar." },
      },
    },
  });
  await page.goto(CHECKOUT_URL);

  await page.getByText("**** 4242").click();
  await page.getByRole("button", { name: /^Pagar/ }).click();
  await expect(page.getByText("Tu orden cambió")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Ver orden actualizada" }).click();
  await expect(page).toHaveURL(/\/5\/2\/order$/);
});

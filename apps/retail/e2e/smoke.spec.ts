import { expect, test } from "@even/e2e";
import { BRANCH_URL, ORDER_URL, mockRetailApi } from "./mocks";

test("la raíz de la sucursal lleva a /order", async ({ page }) => {
  await mockRetailApi(page, { order: null });
  await page.goto(BRANCH_URL);
  await expect(page).toHaveURL(/\/5\/2\/order$/);
});

test("sin orden activa muestra 'Esperando tu orden'", async ({ page }) => {
  await mockRetailApi(page, { order: null });
  await page.goto(ORDER_URL);

  await expect(page.getByText("Esperando tu orden…")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toHaveCount(0);
});

test("muestra la orden activa con sus platillos y el total", async ({ page }) => {
  await mockRetailApi(page);
  await page.goto(ORDER_URL);

  await expect(page.getByText("Tu orden #007")).toBeVisible();
  await expect(page.getByText("Café americano")).toBeVisible();
  await expect(page.getByText("Pan de elote")).toBeVisible();
  await expect(page.getByText("$161.50 MXN")).toBeVisible();
});

test("el header tiene el botón de cuenta que abre el login, como en Tap & Pay", async ({ page }) => {
  await mockRetailApi(page);
  await page.goto(ORDER_URL);

  await page.getByRole("button", { name: "Cuenta" }).click();
  await expect(page.getByPlaceholder(/tel|número|phone/i).first()).toBeVisible();
});

test("sin sesión, pagar lleva a elegir invitado o iniciar sesión", async ({ page }) => {
  await mockRetailApi(page);
  await page.goto(ORDER_URL);

  await page.getByRole("button", { name: /^Pagar/ }).click();
  await expect(page).toHaveURL(/\/5\/2\/auth-selection$/);
});

test("si alguien más la está pagando, no deja continuar", async ({ page }) => {
  const { retailOrder } = await import("./mocks");
  await mockRetailApi(page, { order: { ...retailOrder, en_cobro: true } });
  await page.goto(ORDER_URL);

  await expect(page.getByText("Alguien está pagando esta orden en este momento.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagar/ })).toBeDisabled();
});

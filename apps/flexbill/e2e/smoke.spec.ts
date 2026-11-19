import { expect, test } from "@even/e2e";
import { MENU_URL, PAYMENT_OPTIONS_URL, mockFlexBillApi } from "./mocks";

test("el menú de la mesa carga sus platillos", async ({ page }) => {
  await mockFlexBillApi(page);
  await page.goto(MENU_URL);

  await expect(page.locator("main").getByText("Mesa 12")).toBeVisible();
  await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("$180.00").first()).toBeVisible();
});

test("la cuenta de la mesa ofrece las formas de dividir el pago", async ({ page }) => {
  await mockFlexBillApi(page);
  await page.goto(PAYMENT_OPTIONS_URL);

  await expect(page.getByText("Elige cómo quieres pagar la cuenta")).toBeVisible();
  await expect(page.getByText("Pagar cuenta restante")).toBeVisible();
  await expect(page.getByText("Seleccionar artículos")).toBeVisible();
  await expect(page.getByText("Dividir cuenta")).toBeVisible();
  await expect(page.getByText("Elegir monto")).toBeVisible();
});

test("con la cuenta pendiente, el menú se ilumina sin contador y lleva a la cuenta", async ({ page }) => {
  await mockFlexBillApi(page);
  await page.goto(MENU_URL);

  // Carrito vacío + platillos sin pagar en la mesa: gana el indicador de cuenta.
  const fab = page.getByRole("button", { name: /Cuenta pendiente/ });
  await expect(fab).toBeVisible();
  await expect(fab).toHaveClass(/bg-even-grass/);
  await expect(page.locator("#cart-badge")).toHaveCount(0);

  // El botón de la cuenta queda a la vista, sin número de platillos, y abre la cuenta.
  const account = page.getByRole("button", { name: "Cuenta", exact: true });
  await expect(account).toBeVisible();
  await expect(account).toHaveText("");
  await account.click();
  await expect(page.getByRole("button", { name: "Continuar a pagar" })).toBeVisible();
});

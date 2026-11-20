import { expect, expectFlowTransition, expectNoUnexpectedScroll, mockAuthApi, test } from "@even/e2e";
import { API_URL, cartWithClubSandwich, mockPickAndGoApi } from "./mocks";

const ORDER_CONFIRM_URL = "/4/order-confirm?branch=1";
const CART_URL = "/4/cart?branch=1";

test.use({ viewport: { width: 412, height: 915 } });

test.describe("transición de tarjeta del flujo de compra", () => {
  test("confirmar pedido → pago → agregar tarjeta y de vuelta con el botón de volver", async ({ page }) => {
    await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
    await page.goto(ORDER_CONFIRM_URL);
    await expect(page.getByRole("button", { name: /^Pagar \$/ })).toBeVisible();

    await expectFlowTransition(page, () => page.getByRole("button", { name: /^Pagar \$/ }).click(), {
      step: "card-selection",
    });
    await expect(page.getByText("•••• 4242")).toBeVisible();

    await expectFlowTransition(page, () => page.getByRole("button", { name: "Agregar método de pago" }).click(), {
      step: "add-card",
    });
    await expect(page.getByPlaceholder("123")).toBeVisible();

    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "card-selection" });
    await expect(page).toHaveURL(/\/card-selection\?/);
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "order-confirm" });
    await expect(page).toHaveURL(/\/order-confirm\?/);
    // En Pick & Go "volver" desde la confirmación regresa al carrito sustituyendo la vista.
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "cart" });
    await expect(page).toHaveURL(/\/cart\?/);
  });

  test("el botón atrás del navegador y adelante solo animan la entrada", async ({ page }) => {
    await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
    await page.goto(ORDER_CONFIRM_URL);
    await expectFlowTransition(page, () => page.getByRole("button", { name: /^Pagar \$/ }).click(), {
      step: "card-selection",
    });
    await expect(page.getByText("•••• 4242")).toBeVisible();

    await expectFlowTransition(page, () => page.goBack(), { step: "order-confirm" });
    await expect(page).toHaveURL(/\/order-confirm\?/);
    await expectFlowTransition(page, () => page.goForward(), { step: "card-selection" });
    await expect(page).toHaveURL(/\/card-selection\?/);
  });

  test("volver al carrito con el botón atrás mide lo mismo que su esqueleto", async ({ page }) => {
    await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
    await page.goto(CART_URL);
    await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
    // Navegación del router de Next (sin animación) para tener la entrada del carrito en el historial.
    await page.evaluate((url) => (window as unknown as { next: { router: { push(u: string): void } } }).next.router.push(url), ORDER_CONFIRM_URL);
    await expect(page.getByRole("button", { name: /^Pagar \$/ })).toBeVisible();

    await expectFlowTransition(page, () => page.goBack(), { step: "cart" });
    await expect(page).toHaveURL(/\/cart\?/);
  });
});

test.describe("transición de tarjeta del acceso (auth-selection)", () => {
  test("el carrito anima hacia el acceso, vuelve con el botón y con popstate; teléfono y código llevan a la confirmación", async ({
    page,
  }) => {
    await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
    await mockAuthApi(page, { apiUrl: API_URL, profile: { firstName: "Ana", birthDate: "1996-01-01" } });
    await page.goto(CART_URL);
    await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();

    // Sin sesión: el carrito lleva al acceso con la misma animación que el resto del flujo.
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Ordenar" }).click(), {
      step: "auth-selection",
    });
    await expect(page).toHaveURL(/\/auth-selection\?/);

    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "cart" });
    await expect(page).toHaveURL(/\/cart\?/);

    await expectFlowTransition(page, () => page.getByRole("button", { name: "Ordenar" }).click(), {
      step: "auth-selection",
    });
    await expectFlowTransition(page, () => page.goBack(), { step: "cart" });
    await expectFlowTransition(page, () => page.goForward(), { step: "auth-selection" });

    await page.getByPlaceholder("Número de teléfono").fill("5512345678");
    await page.getByRole("button", { name: "Enviar código" }).click();
    await page.getByPlaceholder("000000").fill("123456");
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Verificar código" }).click(), {
      step: "order-confirm",
    });
    await expect(page).toHaveURL(/\/order-confirm\?/);
  });
});

/** Vistas sin contenido largo: ni la página ni la tarjeta deben mostrar scroll (la lista de artículos queda fuera a propósito). */
for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
  test.describe(`sin scrolls inesperados (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    test("carrito, confirmación, pago, agregar tarjeta y acceso no tienen scroll", async ({ page }) => {
      await mockPickAndGoApi(page, { cartItems: cartWithClubSandwich });
      await mockAuthApi(page, { apiUrl: API_URL });
      await page.goto("/4/cart?branch=1");
      await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "cart");

      await page.goto("/4/order-confirm?branch=1");
      await expect(page.getByRole("button", { name: /^Pagar \$/ })).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "order-confirm");

      await expectFlowTransition(page, () => page.getByRole("button", { name: /^Pagar \$/ }).click(), {
        step: "card-selection",
      });
      await expect(page.getByText(/•••• 4242|\*\*\*\* 4242/)).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "card-selection");

      await expectFlowTransition(page, () => page.getByRole("button", { name: "Agregar método de pago" }).click(), {
        step: "add-card",
      });
      await expect(page.getByPlaceholder("123")).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "add-card");

      await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "card-selection" });
      await expectNoUnexpectedScroll(page, {}, "card-selection (vuelta)");

      await page.goto("/4/auth-selection?branch=1");
      await expect(page.getByPlaceholder("Número de teléfono")).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "auth-selection");
    });
  });
}

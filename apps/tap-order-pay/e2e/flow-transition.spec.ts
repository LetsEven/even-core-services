import { expect, expectFlowTransition, mockAuthApi, test } from "@even/e2e";
import { API_URL } from "./api";
import { TABLE, cartWithClubSandwich, mockTapOrderFlowApi } from "./mocks";

const ORDER_CONFIRM_URL = `/4/1/order-confirm?table=${TABLE}`;
const CART_URL = `/4/1/cart?table=${TABLE}`;

test.use({ viewport: { width: 412, height: 915 } });

test.describe("transición de tarjeta del flujo de compra", () => {
  test("confirmar pedido → pago → agregar tarjeta y de vuelta con el botón de volver", async ({ page }) => {
    await mockTapOrderFlowApi(page, { cartItems: cartWithClubSandwich });
    await page.goto(ORDER_CONFIRM_URL);
    await expect(page.getByRole("button", { name: /^Pagar \$/ })).toBeVisible();

    await expectFlowTransition(page, () => page.getByRole("button", { name: /^Pagar \$/ }).click(), {
      step: "card-selection",
    });
    await expect(page.getByText("**** 4242")).toBeVisible();

    await expectFlowTransition(page, () => page.getByRole("button", { name: "Agregar método de pago" }).click(), {
      step: "add-card",
    });
    await expect(page.getByPlaceholder("123")).toBeVisible();

    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "card-selection" });
    await expect(page).toHaveURL(/\/card-selection\?/);
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "order-confirm" });
    await expect(page).toHaveURL(/\/order-confirm\?/);
  });

  test("el botón atrás del navegador y adelante solo animan la entrada", async ({ page }) => {
    await mockTapOrderFlowApi(page, { cartItems: cartWithClubSandwich });
    await page.goto(ORDER_CONFIRM_URL);
    await expectFlowTransition(page, () => page.getByRole("button", { name: /^Pagar \$/ }).click(), {
      step: "card-selection",
    });
    await expect(page.getByText("**** 4242")).toBeVisible();

    await expectFlowTransition(page, () => page.goBack(), { step: "order-confirm" });
    await expect(page).toHaveURL(/\/order-confirm\?/);
    await expectFlowTransition(page, () => page.goForward(), { step: "card-selection" });
    await expect(page).toHaveURL(/\/card-selection\?/);
  });

  test("volver al carrito con el botón atrás mide lo mismo que su esqueleto", async ({ page }) => {
    await mockTapOrderFlowApi(page, { cartItems: cartWithClubSandwich });
    await page.goto(CART_URL);
    await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
    // Navegación del router de Next (sin animación) para tener la entrada del carrito en el historial.
    await page.evaluate((url) => (window as unknown as { next: { router: { push(u: string): void } } }).next.router.push(url), ORDER_CONFIRM_URL);
    await expect(page.getByRole("button", { name: /^Pagar \$/ })).toBeVisible();

    await expectFlowTransition(page, () => page.goBack(), { step: "cart" });
    await expect(page).toHaveURL(/\/cart\?/);
  });
});

test.describe("transición de tarjeta del acceso (auth)", () => {
  test("el carrito anima hacia el acceso y vuelve; con teléfono y código termina en la confirmación", async ({ page }) => {
    await mockTapOrderFlowApi(page, { cartItems: cartWithClubSandwich });
    await mockAuthApi(page, { apiUrl: API_URL, profile: { firstName: "Ana", birthDate: "1996-01-01" } });
    await page.goto(CART_URL);
    await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();

    // Sin sesión: el carrito lleva al acceso con la misma animación que el resto del flujo.
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Ordenar" }).click(), { step: "auth" });
    await expect(page).toHaveURL(/\/auth\?/);
    await expect(page.getByRole("button", { name: "Continuar como invitado" })).toBeVisible();

    // Volver con el botón: animación completa hacia el carrito.
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "cart" });
    await expect(page).toHaveURL(/\/cart\?/);

    // Otra vez al acceso, ahora con popstate (solo entrada) y con teléfono + código.
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Ordenar" }).click(), { step: "auth" });
    await expectFlowTransition(page, () => page.goBack(), { step: "cart" });
    await expectFlowTransition(page, () => page.goForward(), { step: "auth" });

    await page.getByPlaceholder("Número de teléfono").fill("5512345678");
    await page.getByRole("button", { name: "Enviar código" }).click();
    await page.getByPlaceholder("000000").fill("123456");
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Verificar código" }).click(), {
      step: "order-confirm",
    });
    await expect(page).toHaveURL(/\/order-confirm\?/);
  });
});

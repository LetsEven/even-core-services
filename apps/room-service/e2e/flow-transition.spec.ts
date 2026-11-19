import { expect, expectFlowTransition, test } from "@even/e2e";
import { ROOM, cartWithClubSandwich, mockRoomServiceApi } from "./mocks";

const ORDER_CONFIRM_URL = `/4/1/order-confirm?room=${ROOM}`;
const CART_URL = `/4/1/cart?room=${ROOM}`;

test.use({ viewport: { width: 412, height: 915 } });

test.describe("transición de tarjeta del flujo de compra", () => {
  test("confirmar pedido → pago → agregar tarjeta y de vuelta con el botón de volver", async ({ page }) => {
    await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
    await page.goto(ORDER_CONFIRM_URL);
    await expect(page.getByRole("button", { name: "Continuar" })).toBeVisible();

    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar" }).click(), {
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
    await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
    await page.goto(ORDER_CONFIRM_URL);
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar" }).click(), {
      step: "card-selection",
    });
    await expect(page.getByText("**** 4242")).toBeVisible();

    await expectFlowTransition(page, () => page.goBack(), { step: "order-confirm" });
    await expect(page).toHaveURL(/\/order-confirm\?/);
    await expectFlowTransition(page, () => page.goForward(), { step: "card-selection" });
    await expect(page).toHaveURL(/\/card-selection\?/);
  });

  test("volver al carrito con el botón atrás mide lo mismo que su esqueleto", async ({ page }) => {
    await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
    await page.goto(CART_URL);
    await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
    // Navegación del router de Next (sin animación) para tener la entrada del carrito en el historial.
    await page.evaluate((url) => (window as unknown as { next: { router: { push(u: string): void } } }).next.router.push(url), ORDER_CONFIRM_URL);
    await expect(page.getByRole("button", { name: "Continuar" })).toBeVisible();

    await expectFlowTransition(page, () => page.goBack(), { step: "cart" });
    await expect(page).toHaveURL(/\/cart\?/);
  });
});

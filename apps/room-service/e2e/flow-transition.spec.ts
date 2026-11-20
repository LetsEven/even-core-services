import { expect, expectFlowTransition, expectNoUnexpectedScroll, mockAuthApi, test } from "@even/e2e";
import { API_URL, ROOM, cartWithClubSandwich, mockRoomServiceApi } from "./mocks";

const ORDER_CONFIRM_URL = `/4/1/order-confirm?room=${ROOM}`;
const CART_URL = `/4/1/cart?room=${ROOM}`;

test.use({ viewport: { width: 412, height: 915 } });

test.describe("transición de tarjeta del flujo de compra", () => {
  test("confirmar pedido → pago → agregar tarjeta y de vuelta con el botón de volver", async ({ page }) => {
    await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
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
    await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
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
    await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
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
  test("el carrito anima hacia el acceso y vuelve; como invitado llega a capturar el nombre", async ({ page }) => {
    await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
    await mockAuthApi(page, { apiUrl: API_URL });
    await page.goto(CART_URL);
    await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();

    // Sin sesión: el carrito lleva al acceso con la misma animación que el resto del flujo.
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Ordenar" }).click(), { step: "auth" });
    await expect(page).toHaveURL(/\/auth\?/);

    // Volver con el botón: animación completa hacia el carrito; con popstate, solo la entrada.
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "cart" });
    await expect(page).toHaveURL(/\/cart\?/);
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Ordenar" }).click(), { step: "auth" });
    await expectFlowTransition(page, () => page.goBack(), { step: "cart" });
    await expectFlowTransition(page, () => page.goForward(), { step: "auth" });

    // Invitado: del acceso al nombre y de vuelta con el botón.
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar como invitado" }).click(), {
      step: "user",
    });
    await expect(page).toHaveURL(/\/user\?/);
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "auth" });
  });

  test("con teléfono y código el acceso vuelve a la confirmación del pedido", async ({ page }) => {
    await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
    await mockAuthApi(page, { apiUrl: API_URL, profile: { firstName: "Ana", birthDate: "1996-01-01" } });
    await page.goto(CART_URL);
    await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Ordenar" }).click(), { step: "auth" });

    await page.getByPlaceholder("Número de teléfono").fill("5512345678");
    await page.getByRole("button", { name: "Enviar código" }).click();
    await page.getByPlaceholder("000000").fill("123456");
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Verificar código" }).click(), {
      step: "order-confirm",
    });
    await expect(page).toHaveURL(/\/order-confirm\?/);
  });
});

/**
 * Pantallas altas y bajas (iPhone SE 375x667, Android compacto 360x640): el hero se compacta por altura y todas las
 * vistas del flujo caben sin scroll del documento.
 */
const SCROLL_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 375, height: 667 },
  { width: 360, height: 640 },
];

/** Vistas sin contenido largo: ni la página ni la tarjeta deben mostrar scroll (la lista de artículos se prueba aparte). */
for (const viewport of SCROLL_VIEWPORTS) {
  test.describe(`sin scrolls inesperados (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });
    // En 360x640 los métodos de pago (tarjeta, Apple/Google Pay, agregar) con el desglose de comisión no caben del todo:
    // la vista se desplaza con el botón de pagar fijo. En el resto de tamaños cabe sin scroll.
    const cardSelectionScroll = { allowDocumentY: viewport.height <= 640 };

    test("carrito, confirmación, pago, agregar tarjeta y acceso no tienen scroll", async ({ page }) => {
      await mockRoomServiceApi(page, { cartItems: cartWithClubSandwich });
      await mockAuthApi(page, { apiUrl: API_URL });
      await page.goto("/4/1/cart?room=40");
      await expect(page.getByText("Club sándwich", { exact: false }).first()).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "cart");

      await page.goto("/4/1/order-confirm?room=40");
      await expect(page.getByRole("button", { name: /^Pagar \$/ })).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "order-confirm");

      await expectFlowTransition(page, () => page.getByRole("button", { name: /^Pagar \$/ }).click(), {
        step: "card-selection",
        // Donde la vista real se desplaza, el esqueleto (que no desborda) no puede medir lo mismo.
        skipHeightCheck: viewport.height <= 640,
      });
      await expect(page.getByText(/•••• 4242|\*\*\*\* 4242/)).toBeVisible();
      await expectNoUnexpectedScroll(page, cardSelectionScroll, "card-selection");

      await expectFlowTransition(page, () => page.getByRole("button", { name: "Agregar método de pago" }).click(), {
        step: "add-card",
      });
      await expect(page.getByPlaceholder("123")).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "add-card");

      await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), {
        step: "card-selection",
        skipHeightCheck: viewport.height <= 640,
      });
      await expectNoUnexpectedScroll(page, cardSelectionScroll, "card-selection (vuelta)");

      await page.goto("/4/1/auth-selection?room=40");
      await expect(page.getByPlaceholder("Número de teléfono")).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "auth-selection");
    });
  });
}

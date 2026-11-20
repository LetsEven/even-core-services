import { expect, expectFlowTransition, expectNoUnexpectedScroll, mockAuthApi, test } from "@even/e2e";
import {
  API_URL,
  CARD_SELECTION_URL,
  ORDER_URL,
  PAYMENT_OPTIONS_URL,
  mockTapAndPayApi,
  tacosAlPastor,
  tapPayOrder,
} from "./mocks";

test.use({ viewport: { width: 412, height: 915 } });

test.describe("transición de tarjeta del flujo de pago", () => {
  test("avanza y vuelve con animación: esqueleto con la altura de la vista real", async ({ page }) => {
    await mockTapAndPayApi(page);
    await page.goto(PAYMENT_OPTIONS_URL);
    await expect(page.getByText("Pagar cuenta restante")).toBeVisible();

    // Adelante: opciones de pago → propina
    await expectFlowTransition(page, () => page.getByText("Pagar cuenta restante").click(), { step: "tip-selection" });
    await expect(page).toHaveURL(/\/tip-selection\?/);

    // Adelante: propina → pago
    await expectFlowTransition(page, () => page.getByRole("button", { name: /^Pagar \$/ }).click(), {
      step: "card-selection",
    });
    await expect(page).toHaveURL(/\/card-selection\?/);
    await expect(page.getByText("**** 4242")).toBeVisible();

    // Atrás con el botón de volver: pago → propina → opciones
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "tip-selection" });
    await expect(page).toHaveURL(/\/tip-selection\?/);
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "payment-options" });
    await expect(page).toHaveURL(/\/payment-options\?/);
    await expect(page.getByText("Seleccionar artículos")).toBeVisible();
  });

  test("volver de las opciones de pago a la cuenta de la mesa anima con la altura de la vista real", async ({ page }) => {
    await mockTapAndPayApi(page);
    await page.goto(PAYMENT_OPTIONS_URL);
    await expect(page.getByText("Pagar cuenta restante")).toBeVisible();

    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "order" });
    await expect(page).toHaveURL(/\/order\?/);
    await expect(page.getByText("Tacos al pastor")).toBeVisible();
  });

  test("el botón atrás del navegador y adelante solo animan la entrada", async ({ page }) => {
    await mockTapAndPayApi(page);
    await page.goto(PAYMENT_OPTIONS_URL);
    await expectFlowTransition(page, () => page.getByText("Pagar cuenta restante").click(), { step: "tip-selection" });
    await expect(page).toHaveURL(/\/tip-selection\?/);

    // popstate: el navegador ya cambió la URL, no hay fase de bajada.
    const goBack = await expectFlowTransition(page, () => page.goBack(), { step: "payment-options" });
    await expect(page).toHaveURL(/\/payment-options\?/);
    expect(goBack.realHeight).toBeGreaterThan(0);

    await expectFlowTransition(page, () => page.goForward(), { step: "tip-selection" });
    await expect(page).toHaveURL(/\/tip-selection\?/);
  });

  for (const option of ["Dividir cuenta", "Elegir monto", "Seleccionar artículos"]) {
    test(`la sub-vista "${option}" de la propina mide lo mismo que su esqueleto`, async ({ page }) => {
      await mockTapAndPayApi(page);
      await page.goto(PAYMENT_OPTIONS_URL);
      await expect(page.getByText(option)).toBeVisible();
      await expectFlowTransition(page, () => page.getByText(option).click(), { step: "tip-selection", tolerance: 12 });
      // Y vuelve a las opciones con animación.
      await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "payment-options" });
    });
  }

  test("agregar tarjeta anima desde el pago y vuelve con el botón de volver", async ({ page }) => {
    await mockTapAndPayApi(page);
    await page.goto(CARD_SELECTION_URL);
    await expect(page.getByText("**** 4242")).toBeVisible();

    await expectFlowTransition(page, () => page.getByRole("button", { name: "Agregar método de pago" }).click(), {
      step: "add-card",
    });
    await expect(page).toHaveURL(/\/add-card\?/);
    await expect(page.getByPlaceholder("123")).toBeVisible();

    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "card-selection" });
    await expect(page).toHaveURL(/\/card-selection\?/);
  });
});

test.describe("transición de tarjeta del acceso (auth-selection)", () => {
  test("la cuenta avanza al acceso y vuelve con el botón y con popstate; como invitado captura el nombre", async ({ page }) => {
    await mockTapAndPayApi(page);
    await mockAuthApi(page, { apiUrl: API_URL });
    await page.goto(ORDER_URL);
    await expect(page.getByText("Tacos al pastor")).toBeVisible();

    // Sin sesión ni registro en la cuenta: "Continuar" lleva al acceso.
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar" }).click(), {
      step: "auth-selection",
    });
    await expect(page).toHaveURL(/\/auth-selection\?/);
    await expect(page.getByRole("button", { name: "Acceder" })).toBeVisible();

    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "order" });
    await expect(page).toHaveURL(/\/order\?/);

    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar" }).click(), {
      step: "auth-selection",
    });
    await expectFlowTransition(page, () => page.goBack(), { step: "order" });
    await expectFlowTransition(page, () => page.goForward(), { step: "auth-selection" });

    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar como invitado" }).click(), {
      step: "user",
    });
    await expect(page).toHaveURL(/\/user\?/);
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "auth-selection" });
  });

  test("con teléfono y código el acceso vuelve al flujo de pago", async ({ page }) => {
    await mockTapAndPayApi(page);
    await mockAuthApi(page, { apiUrl: API_URL, profile: { firstName: "Ana", birthDate: "1996-01-01" } });
    await page.goto(ORDER_URL);
    await expect(page.getByText("Tacos al pastor")).toBeVisible();
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar" }).click(), {
      step: "auth-selection",
    });

    await page.getByPlaceholder("Número de teléfono").fill("5512345678");
    await page.getByRole("button", { name: "Acceder" }).click();
    await page.getByPlaceholder("000000").fill("123456");
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Verificar código" }).click(), {
      step: "payment-options",
    });
    await expect(page).toHaveURL(/\/payment-options\?/);
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

    test("cuenta, opciones, propina, pago y agregar tarjeta no tienen scroll", async ({ page }) => {
      await mockTapAndPayApi(page);
      await mockAuthApi(page, { apiUrl: API_URL });
      await page.goto("/5/2/order?table=1");
      await expect(page.getByText("Tacos al pastor").or(page.getByText("Cuenta Compartida"))).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "order");

      await page.goto("/5/2/payment-options?table=1");
      await expect(page.getByText("Pagar cuenta restante")).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "payment-options");

      await expectFlowTransition(page, () => page.getByText("Pagar cuenta restante").click(), { step: "tip-selection" });
      await expectNoUnexpectedScroll(page, {}, "tip-selection");

      await expectFlowTransition(page, () => page.getByRole("button", { name: /^Pagar \$/ }).click(), {
        step: "card-selection",
      });
      await expect(page.getByText("**** 4242")).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "card-selection");

      await expectFlowTransition(page, () => page.getByRole("button", { name: "Agregar método de pago" }).click(), {
        step: "add-card",
      });
      await expect(page.getByPlaceholder("123")).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "add-card");

      // Y de vuelta: la transición de bajada tampoco deja scroll.
      await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "card-selection" });
      await expectNoUnexpectedScroll(page, {}, "card-selection (vuelta)");
    });

    test("seleccionar artículos: solo la lista se desplaza; hero y resumen quedan fijos", async ({ page }) => {
      await mockTapAndPayApi(page, {
        order: {
          ...tapPayOrder,
          items: Array.from({ length: 14 }, (_, i) => ({ ...tacosAlPastor, id: `dish_e2e_${i + 1}`, quantity: 1 })),
        },
      });
      await mockAuthApi(page, { apiUrl: API_URL });
      await page.goto("/5/2/payment-options?table=1");
      await expect(page.getByText("Seleccionar artículos")).toBeVisible();
      await expectFlowTransition(page, () => page.getByText("Seleccionar artículos").click(), {
        step: "tip-selection",
        tolerance: 12,
      });
      const list = page.locator("[data-select-items-list]");
      await expect(list).toBeVisible();
      await expectNoUnexpectedScroll(page, { allow: ["[data-select-items-list]"] }, "select-items");

      // La lista es lo único que se desplaza (hay más artículos que espacio) y tiene un alto razonable.
      const metrics = await list.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
      expect(metrics.scroll).toBeGreaterThan(metrics.client);
      expect(metrics.client).toBeGreaterThan(60);
      // Desplazar la lista no mueve el hero ni el resumen de pago, y el documento sigue sin scroll.
      const heroTop = async () => page.locator("[data-flow-hero]").first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
      const payBox = async () => page.getByRole("button", { name: /^Pagar \$/ }).boundingBox();
      const before = { hero: await heroTop(), pay: await payBox() };
      await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await heroTop()).toBe(before.hero);
      expect(await payBox()).toEqual(before.pay);
      expect(before.hero).toBeGreaterThanOrEqual(0);
      const viewportHeight = page.viewportSize()!.height;
      expect(before.pay!.y + before.pay!.height).toBeLessThanOrEqual(viewportHeight);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expectNoUnexpectedScroll(page, { allow: ["[data-select-items-list]"] }, "select-items (desplazada)");
    });

    test("acceso y nombre no tienen scroll", async ({ page }) => {
      await mockTapAndPayApi(page);
      await mockAuthApi(page, { apiUrl: API_URL });
      await page.goto("/5/2/auth-selection?table=1");
      await expect(page.getByPlaceholder("Número de teléfono")).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "auth-selection");
    });
  });
}

import { expect, expectFlowTransition, expectNoUnexpectedScroll, test } from "@even/e2e";
import type { Page } from "@playwright/test";
import {
  AUTH_SELECTION_URL,
  CARD_SELECTION_URL,
  ORDER_URL,
  PAYMENT_OPTIONS_URL,
  mockFlexBillApi,
  mockFlexBillAuthApi,
} from "./mocks";

test.use({ viewport: { width: 412, height: 915 } });

test.describe("transición de tarjeta del flujo de pago", () => {
  test("avanza y vuelve con animación: esqueleto con la altura de la vista real", async ({ page }) => {
    await mockFlexBillApi(page);
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

  test("el botón atrás del navegador y adelante solo animan la entrada", async ({ page }) => {
    await mockFlexBillApi(page);
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
      await mockFlexBillApi(page);
      await page.goto(PAYMENT_OPTIONS_URL);
      await expect(page.getByText(option)).toBeVisible();
      await expectFlowTransition(page, () => page.getByText(option).click(), { step: "tip-selection", tolerance: 12 });
      // Y vuelve a las opciones con animación.
      await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "payment-options" });
    });
  }

  test("agregar tarjeta anima desde el pago y vuelve con el botón de volver", async ({ page }) => {
    await mockFlexBillApi(page);
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

  test("el monto protagonista es el mismo del botón de pagar, cambia en vivo y no se mueve entre vistas", async ({
    page,
  }) => {
    await mockFlexBillApi(page);
    await page.goto(PAYMENT_OPTIONS_URL);
    await expect(page.getByText("Pagar cuenta restante")).toBeVisible();
    const heroTop = async () =>
      page.locator("[data-flow-hero]").first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
    const topOptions = await heroTop();

    await expectFlowTransition(page, () => page.getByText("Pagar cuenta restante").click(), { step: "tip-selection" });
    const total = page.getByTestId("flow-hero-total");
    const payButton = page.getByRole("button", { name: /^Pagar \$/ });
    const amountOf = async () => ((await payButton.textContent()) ?? "").replace("Pagar ", "");
    await expect(total).toHaveText(await amountOf());
    expect(await heroTop()).toBe(topOptions);

    const before = await amountOf();
    await page.getByRole("button", { name: "20%", exact: true }).click();
    await expect(total).toHaveText(await amountOf());
    expect(await amountOf()).not.toBe(before);

    await expectFlowTransition(page, () => payButton.click(), { step: "card-selection" });
    await expect(page.getByText("**** 4242")).toBeVisible();
    await expect(total).toHaveText(await amountOf());
    expect(await heroTop()).toBe(topOptions);
  });
});

/** La casilla real es un input `sr-only`: se marca con la caja dibujada. */
const acceptTerms = (page: Page) => page.locator("label span[aria-hidden]").first().click();

test.describe("transición de tarjeta del flujo secundario: cuenta → acceso", () => {
  /** Cuenta de la mesa lista (ticket cargado) para continuar a pagar. */
  async function openOrder(page: Page, profile?: Parameters<typeof mockFlexBillAuthApi>[1]) {
    await mockFlexBillApi(page);
    await mockFlexBillAuthApi(page, profile);
    await page.goto(ORDER_URL);
    await expect(page.getByText("Cuenta Compartida")).toBeVisible();
  }

  test("la cuenta avanza a acceso, vuelve con el botón y con popstate", async ({ page }) => {
    await openOrder(page);

    // Invitado sin sesión: "Continuar" lleva a elegir cómo acceder.
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar", exact: true }).click(), {
      step: "auth-selection",
    });
    await expect(page).toHaveURL(/\/auth-selection\?/);
    await expect(page.getByRole("button", { name: "Acceder" })).toBeVisible();

    // Botón volver: animación completa hacia la cuenta.
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "order" });
    await expect(page).toHaveURL(/\/order\?/);
    await expect(page.getByText("Cuenta Compartida")).toBeVisible();

    // popstate: solo la fase de entrada, en ambos sentidos.
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar", exact: true }).click(), {
      step: "auth-selection",
    });
    await expectFlowTransition(page, () => page.goBack(), { step: "order" });
    await expect(page).toHaveURL(/\/order\?/);
    await expectFlowTransition(page, () => page.goForward(), { step: "auth-selection" });
    await expect(page).toHaveURL(/\/auth-selection\?/);
  });

  test("como invitado: acceso → nombre → pago, y vuelta atrás con animación", async ({ page }) => {
    await openOrder(page);
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar", exact: true }).click(), {
      step: "auth-selection",
    });

    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar como invitado" }).click(), {
      step: "user",
    });
    await expect(page).toHaveURL(/\/user\?joinOnly=true/);

    // Atrás desde el nombre vuelve al acceso con la animación completa.
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "auth-selection" });
    await expect(page.getByRole("button", { name: "Acceder" })).toBeVisible();

    await page.getByRole("button", { name: "Continuar como invitado" }).click();
    await expect(page).toHaveURL(/\/user\?joinOnly=true/);
    await page.getByRole("textbox").fill("Luis");
    await acceptTerms(page);
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar", exact: true }).click(), {
      step: "payment-options",
    });
    await expect(page).toHaveURL(/\/payment-options\?/);
    await expect(page.getByText("Pagar cuenta restante")).toBeVisible();
  });

  test("con teléfono: número → código → vuelve al flujo de pago", async ({ page }) => {
    await openOrder(page, { profile: { firstName: "Ana", birthDate: "1996-01-01" } });
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar", exact: true }).click(), {
      step: "auth-selection",
    });

    await page.getByPlaceholder("Número de teléfono").fill("5512345678");
    await page.getByRole("button", { name: "Acceder" }).click();
    // El código aparece en la misma tarjeta (sin salir de la pantalla) y "Cambiar número" regresa al teléfono.
    await expect(page.getByText("+52 (551) 234-5678")).toBeVisible();
    await page.getByRole("button", { name: "Cambiar número" }).click();
    await expect(page.getByPlaceholder("Número de teléfono")).toBeVisible();
    await page.getByRole("button", { name: "Acceder" }).click();

    await page.getByPlaceholder("000000").fill("123456");
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Verificar código" }).click(), {
      step: "payment-options",
    });
    await expect(page).toHaveURL(/\/payment-options\?/);
    await expect(page.getByText("Pagar cuenta restante")).toBeVisible();
  });

  test("cuenta nueva: el perfil se pide dentro de la tarjeta y termina en el pago", async ({ page }) => {
    await openOrder(page);
    await page.goto(AUTH_SELECTION_URL);
    // Al entrar directo, el esqueleto de la transición convive un instante con la tarjeta real.
    await expect(page.getByPlaceholder("Número de teléfono")).toHaveCount(1);
    await page.getByPlaceholder("Número de teléfono").fill("5512345678");
    await page.getByRole("button", { name: "Acceder" }).click();
    await page.getByPlaceholder("000000").fill("123456");
    await page.getByRole("button", { name: "Verificar código" }).click();

    await expect(page.getByRole("heading", { name: "Registra tu perfil" }).or(page.getByText("Registra tu perfil"))).toBeVisible();
    await page.getByPlaceholder("Nombre", { exact: true }).fill("Ana");
    await page.getByLabel("Edad").selectOption("30");
    await acceptTerms(page);
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar", exact: true }).click(), {
      step: "payment-options",
      skipHeightCheck: true,
    });
    await expect(page).toHaveURL(/\/payment-options\?/);
  });

  test("la pantalla de acceso mide lo mismo que su esqueleto al volver desde el pago", async ({ page }) => {
    await mockFlexBillApi(page);
    await mockFlexBillAuthApi(page);
    await page.goto(AUTH_SELECTION_URL);
    await expect(page.getByRole("button", { name: "Acceder" })).toBeVisible();
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Continuar como invitado" }).click(), {
      step: "user",
    });
    await expectFlowTransition(page, () => page.getByTestId("flow-back").click(), { step: "auth-selection" });
  });
});

/** Vistas sin contenido largo: ni la página ni la tarjeta deben mostrar scroll (la lista de artículos queda fuera a propósito). */
for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
  test.describe(`sin scrolls inesperados (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport });

    test("cuenta, opciones, propina, pago y agregar tarjeta no tienen scroll", async ({ page }) => {
      await mockFlexBillApi(page);
      await mockFlexBillAuthApi(page);
      await page.goto("/4/1/order?table=12&session=e2e-table-session");
      await expect(page.getByText("Tacos al pastor").or(page.getByText("Cuenta Compartida"))).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "order");

      await page.goto("/4/1/payment-options?table=12&session=e2e-table-session");
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

    test("acceso y nombre no tienen scroll", async ({ page }) => {
      await mockFlexBillApi(page);
      await mockFlexBillAuthApi(page);
      await page.goto("/4/1/auth-selection?table=12&session=e2e-table-session");
      await expect(page.getByPlaceholder("Número de teléfono")).toBeVisible();
      await expectNoUnexpectedScroll(page, {}, "auth-selection");
    });
  });
}

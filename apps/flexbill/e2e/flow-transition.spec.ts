import { expect, expectFlowTransition, test } from "@even/e2e";
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
    await expectFlowTransition(page, () => page.getByRole("button", { name: "Pagar", exact: true }).click(), {
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

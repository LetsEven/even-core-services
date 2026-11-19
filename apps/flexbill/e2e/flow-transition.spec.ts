import { expect, expectFlowTransition, test } from "@even/e2e";
import { CARD_SELECTION_URL, PAYMENT_OPTIONS_URL, mockFlexBillApi } from "./mocks";

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

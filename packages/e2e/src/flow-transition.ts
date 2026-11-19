import { expect, type Page } from "@playwright/test";

/** Diferencia máxima (px) entre la tarjeta del esqueleto y la de la vista real ya cargada. */
export const CARD_HEIGHT_TOLERANCE = 4;

export interface FlowTransitionOptions {
  /** Paso (segmento de ruta) cuyo esqueleto debe aparecer. */
  step: string;
  /** Si el esqueleto cambia de altura a propósito (datos que llegan después), no compara alturas. */
  skipHeightCheck?: boolean;
  /** Tolerancia de altura en px (por defecto `CARD_HEIGHT_TOLERANCE`). */
  tolerance?: number;
}

export interface FlowTransitionResult {
  skeletonHeight: number;
  realHeight: number;
}

const cardHeight = (card: ReturnType<Page["locator"]>) => card.evaluate((el) => el.getBoundingClientRect().height);

/**
 * Ejecuta `action` (clic en un botón, en volver, `page.goBack()`...) y comprueba la transición de tarjeta del flujo:
 * aparece el overlay del paso destino (`[data-flow-overlay]`), se retira, y la tarjeta del esqueleto mide lo mismo
 * que la de la vista real que queda debajo.
 */
export async function expectFlowTransition(
  page: Page,
  action: () => Promise<unknown>,
  { step, skipHeightCheck = false, tolerance = CARD_HEIGHT_TOLERANCE }: FlowTransitionOptions,
): Promise<FlowTransitionResult> {
  const overlay = page.locator(`[data-flow-overlay="${step}"]`);
  // Se empieza a mirar antes de la acción: con popstate el esqueleto aparece de inmediato.
  const skeleton = (async () => {
    await overlay.waitFor({ state: "attached", timeout: 10_000 });
    return cardHeight(overlay.locator(".sheet-card").first());
  })();
  // Si la acción falla, el rechazo de `skeleton` no debe quedar sin atender.
  skeleton.catch(() => undefined);
  await action();
  const skeletonHeight = await skeleton;
  await overlay.waitFor({ state: "detached", timeout: 15_000 });
  await expect(page.locator("[data-flow-overlay]")).toHaveCount(0);

  const real = page.locator(".sheet-card").first();
  await real.waitFor({ state: "visible" });
  const realHeight = await cardHeight(real);
  if (!skipHeightCheck) {
    expect(
      Math.abs(skeletonHeight - realHeight),
      `Alto de la tarjeta de "${step}": esqueleto ${skeletonHeight}px vs vista real ${realHeight}px`,
    ).toBeLessThanOrEqual(tolerance);
  }
  return { skeletonHeight, realHeight };
}

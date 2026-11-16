"use client";

import { useSyncExternalStore } from "react";

/**
 * Cambio de vista inmediato dentro del flujo de compra (p. ej. carrito → confirmación → pago).
 * En cuanto se pide navegar, `FlowNavOverlay` sube la tarjeta del paso destino con un esqueleto
 * y su título, sin esperar a que la ruta nueva se cargue; cuando la ruta ya está montada
 * (`notifyRouteChanged`, desde `RouteTransitionGate`) el esqueleto se retira y queda el contenido real.
 *
 * Los pasos son los segmentos de ruta de cada app (`cart`, `order-confirm`, `card-selection`...), así
 * que sirve con `/{restaurante}/{paso}` y con `/{restaurante}/{sucursal}/{paso}`.
 */

// Tiempo que tarda en bajar la tarjeta actual antes de navegar.
export const LEAVE_MS = 500;
// Tiempo mínimo que el esqueleto (la tarjeta nueva subiendo) se queda visible.
export const ENTER_MS = 800;
// Si la ruta no llega a montarse (error de red), no dejar el esqueleto para siempre.
const MAX_WAIT_MS = 8000;

let pendingStep: string | null = null;
let shownAt = 0;
let timer: number | undefined;
let settleTimer: number | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setPending(step: string | null) {
  pendingStep = step;
  shownAt = step ? performance.now() : 0;
  window.clearTimeout(timer);
  window.clearTimeout(settleTimer);
  if (step) timer = window.setTimeout(() => setPending(null), MAX_WAIT_MS);
  emit();
}

/** Primer segmento de la ruta que es un paso del flujo (ignora restaurante y sucursal). */
export function flowStepOf(path: string, steps: readonly string[]): string | null {
  const segments = path.split("?")[0].split("/").filter(Boolean);
  return segments.find((segment) => steps.includes(segment)) ?? null;
}

/** Paso del flujo al que se está navegando, o null. */
export function usePendingFlowStep(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pendingStep,
    () => null,
  );
}

/** La ruta nueva ya se montó: retirar el esqueleto cuando termine de subir. */
export function notifyRouteChanged() {
  if (!pendingStep) return;
  const remaining = ENTER_MS - (performance.now() - shownAt);
  window.clearTimeout(settleTimer);
  if (remaining > 0) settleTimer = window.setTimeout(() => setPending(null), remaining);
  else setPending(null);
}

/**
 * Cambio de paso del flujo: la tarjeta actual baja, el título se desvanece y entonces navega mostrando
 * de inmediato el esqueleto del paso destino subiendo. Hacia otras vistas (o con movimiento reducido)
 * navega sin animación.
 */
export function startRouteTransition(toPath: string, navigate: () => void, steps: readonly string[]) {
  const target = flowStepOf(toPath, steps);
  const current = flowStepOf(window.location.pathname, steps);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Solo entre pasos del flujo: desde el menú u otra vista no hay tarjeta que bajar.
  if (!target || !current || current === target || reduced || pendingStep) {
    navigate();
    return;
  }
  document.querySelectorAll(".sheet-card, .sheet-hero").forEach((element) => {
    element.setAttribute("data-flow-leaving", "");
  });
  window.setTimeout(() => {
    setPending(target);
    navigate();
  }, LEAVE_MS);
}

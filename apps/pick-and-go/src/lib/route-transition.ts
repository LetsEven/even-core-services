"use client";

import { useSyncExternalStore } from "react";

/**
 * Cambio de vista inmediato dentro del flujo de compra (carrito → confirmación
 * → pago y de regreso). En cuanto se pide navegar, `FlowNavOverlay` sube la
 * tarjeta del paso destino con un esqueleto y su título, sin esperar a que la
 * ruta nueva se cargue; cuando la ruta ya está montada
 * (`notifyRouteChanged`, desde `RouteTransitionGate`) el esqueleto se retira y
 * queda el contenido real.
 */

export type FlowStep = "cart" | "order-confirm" | "card-selection";

const FLOW_STEPS: FlowStep[] = ["cart", "order-confirm", "card-selection"];
// Tiempo que tarda en bajar la tarjeta actual antes de navegar.
export const LEAVE_MS = 500;
// Tiempo mínimo que el esqueleto (la tarjeta nueva subiendo) se queda visible.
export const ENTER_MS = 800;
// Si la ruta no llega a montarse (error de red), no dejar el esqueleto para siempre.
const MAX_WAIT_MS = 8000;

let pendingStep: FlowStep | null = null;
let shownAt = 0;
let timer: number | undefined;
let settleTimer: number | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setPending(step: FlowStep | null) {
  pendingStep = step;
  shownAt = step ? performance.now() : 0;
  window.clearTimeout(timer);
  window.clearTimeout(settleTimer);
  if (step) timer = window.setTimeout(() => setPending(null), MAX_WAIT_MS);
  emit();
}

function stepOf(path: string): string | null {
  const segments = path.split("?")[0].split("/").filter(Boolean);
  return segments[1] ?? null;
}

function asFlowStep(step: string | null): FlowStep | null {
  return FLOW_STEPS.includes(step as FlowStep) ? (step as FlowStep) : null;
}

/** Paso del flujo al que se está navegando, o null. */
export function usePendingFlowStep(): FlowStep | null {
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
 * Cambio de paso del flujo: la tarjeta actual baja, el título se desvanece y
 * entonces navega mostrando de inmediato el esqueleto del paso destino subiendo.
 * Hacia otras vistas (o con movimiento reducido) navega sin animación.
 */
export function startRouteTransition(toPath: string, navigate: () => void) {
  const target = asFlowStep(stepOf(toPath));
  const current = stepOf(window.location.pathname);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!target || current === target || reduced || pendingStep) {
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

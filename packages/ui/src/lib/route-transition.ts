"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

/**
 * Cambio de vista inmediato dentro del flujo de compra (p. ej. carrito → confirmación → pago).
 * En cuanto se pide navegar, `FlowNavOverlay` sube la tarjeta del paso destino con un esqueleto
 * y su título, sin esperar a que la ruta nueva se cargue; cuando la ruta ya está montada
 * (`notifyRouteChanged`, desde `RouteTransitionGate`) **y** la vista declara que ya tiene los datos
 * que cambian su estructura (`useFlowStepReady`), el esqueleto se retira y queda el contenido real.
 *
 * Los pasos son los segmentos de ruta de cada app (`cart`, `order-confirm`, `card-selection`...), así
 * que sirve con `/{restaurante}/{paso}` y con `/{restaurante}/{sucursal}/{paso}`.
 */

export type FlowTiming = {
  /** Tiempo que tarda en bajar la tarjeta actual antes de navegar. */
  leaveMs: number;
  /** Tiempo mínimo que el esqueleto (la tarjeta nueva subiendo) se queda visible. */
  enterMs: number;
  /** Si la ruta no llega a montarse o a estar lista (error de red), no dejar el esqueleto para siempre. */
  maxWaitMs: number;
};

export const DEFAULT_FLOW_TIMING: FlowTiming = { leaveMs: 500, enterMs: 800, maxWaitMs: 8000 };

// Se conservan por compatibilidad con las apps que ya los importan.
export const LEAVE_MS = DEFAULT_FLOW_TIMING.leaveMs;
export const ENTER_MS = DEFAULT_FLOW_TIMING.enterMs;

let pendingStep: string | null = null;
let shownAt = 0;
let routeMounted = false;
let timing: FlowTiming = DEFAULT_FLOW_TIMING;
let timer: number | undefined;
let settleTimer: number | undefined;
/** Vistas montadas que aún no tienen sus datos: mientras haya alguna, el esqueleto no se retira. */
let blockers = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setPending(step: string | null) {
  pendingStep = step;
  shownAt = step ? performance.now() : 0;
  routeMounted = false;
  window.clearTimeout(timer);
  window.clearTimeout(settleTimer);
  if (step) timer = window.setTimeout(() => setPending(null), timing.maxWaitMs);
  emit();
}

/** Retira el esqueleto cuando la ruta está montada, los datos listos y pasó el tiempo mínimo. */
function trySettle() {
  if (!pendingStep || !routeMounted || blockers > 0) return;
  const remaining = timing.enterMs - (performance.now() - shownAt);
  window.clearTimeout(settleTimer);
  if (remaining > 0) settleTimer = window.setTimeout(trySettle, remaining);
  else setPending(null);
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

/** La ruta nueva ya se montó: retirar el esqueleto cuando termine de subir y la vista esté lista. */
export function notifyRouteChanged() {
  if (!pendingStep) return;
  routeMounted = true;
  trySettle();
}

/**
 * La vista del paso llama esto con `ready={false}` mientras le falten los datos que cambian su
 * estructura (tipo de pago, sucursales, propina...). El esqueleto de la transición se queda hasta
 * que pase a `true`, así la tarjeta no cambia de altura después de haber subido.
 * Sin llamarlo, la vista se considera lista en cuanto monta.
 */
export function useFlowStepReady(ready: boolean) {
  useLayoutEffect(() => {
    if (ready) return;
    blockers += 1;
    return () => {
      blockers -= 1;
      trySettle();
    };
  }, [ready]);
}

/**
 * Cambio de paso del flujo: la tarjeta actual baja, el título se desvanece y entonces navega mostrando
 * de inmediato el esqueleto del paso destino subiendo. Hacia otras vistas (o con movimiento reducido)
 * navega sin animación. `options` ajusta los tiempos por app o servicio.
 */
export function startRouteTransition(
  toPath: string,
  navigate: () => void,
  steps: readonly string[],
  options?: Partial<FlowTiming>,
) {
  const target = flowStepOf(toPath, steps);
  const current = flowStepOf(window.location.pathname, steps);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Solo entre pasos del flujo: desde el menú u otra vista no hay tarjeta que bajar.
  if (!target || !current || current === target || reduced || pendingStep) {
    navigate();
    return;
  }
  timing = { ...DEFAULT_FLOW_TIMING, ...options };
  document.querySelectorAll(".sheet-card, .sheet-hero").forEach((element) => {
    element.setAttribute("data-flow-leaving", "");
  });
  window.setTimeout(() => {
    setPending(target);
    navigate();
  }, timing.leaveMs);
}

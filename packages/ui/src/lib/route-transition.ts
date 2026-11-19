"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

/**
 * Cambio de vista inmediato dentro del flujo de compra (p. ej. carrito → confirmación → pago), hacia adelante y
 * hacia atrás. En cuanto se pide navegar, `FlowNavOverlay` sube la tarjeta del paso destino con un esqueleto y su
 * título, sin esperar a que la ruta nueva se cargue; cuando la ruta ya está montada (`notifyRouteChanged`, desde
 * `RouteTransitionGate`) **y** la vista declara que ya tiene los datos que cambian su estructura
 * (`useFlowStepReady`), el esqueleto se retira y queda el contenido real.
 *
 * - Adelante: `startRouteTransition` (la tarjeta actual baja y luego sube la nueva).
 * - Atrás: `startRouteBack` hace lo mismo hacia la vista anterior; el historial de vistas montadas
 *   (`recordFlowPath`) dice cuál es. El `popstate` del navegador (gesto de iOS, botón atrás/adelante) solo anima la
 *   entrada (`startPopstateListener`): el navegador ya cambió la URL.
 *
 * Los pasos son los segmentos de ruta de cada app (`cart`, `order-confirm`, `card-selection`...), así que sirve con
 * `/{restaurante}/{paso}` y con `/{restaurante}/{sucursal}/{paso}`. Las apps no lo usan directo: `@even/ui/diner`
 * lo envuelve en `FlowTransitionProvider` y `useFlowNavigation`.
 */

export type FlowTiming = {
  /** Tiempo que tarda en bajar la tarjeta actual antes de navegar. */
  leaveMs: number;
  /** Tiempo mínimo que el esqueleto (la tarjeta nueva subiendo) se queda visible. */
  enterMs: number;
  /** Si la ruta no llega a montarse o a estar lista (error de red), no dejar el esqueleto para siempre. */
  maxWaitMs: number;
};

/** Paso al que se está navegando y la ruta (con query) completa. */
export type FlowTarget = { step: string; path: string };

export const DEFAULT_FLOW_TIMING: FlowTiming = { leaveMs: 500, enterMs: 800, maxWaitMs: 8000 };

// Se conservan por compatibilidad con las apps que ya los importan.
export const LEAVE_MS = DEFAULT_FLOW_TIMING.leaveMs;
export const ENTER_MS = DEFAULT_FLOW_TIMING.enterMs;

let pendingStep: string | null = null;
/** Ruta completa (con query) del paso pendiente: algunas pantallas cambian de forma según un parámetro (`type=`). */
let pendingPath: string | null = null;
let pendingTarget: FlowTarget | null = null;
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

/** Quita la marca de salida de las hojas (si la navegación no llegó a desmontarlas, vuelven a su lugar). */
function clearLeaving() {
  document.querySelectorAll("[data-flow-leaving]").forEach((element) => element.removeAttribute("data-flow-leaving"));
}

function setPending(step: string | null, path: string | null = null) {
  if (!step) clearLeaving();
  pendingStep = step;
  pendingPath = step ? path : null;
  pendingTarget = step ? { step, path: pendingPath ?? "" } : null;
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

/** Paso y ruta completa (con query) al que se navega, o null. Para esqueletos que dependen de la query. */
export function usePendingFlowTarget(): FlowTarget | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pendingTarget,
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

/** Tiempos por defecto con los que haya definido la app (un campo `undefined` no pisa el valor por defecto). */
function resolveTiming(options?: Partial<FlowTiming>): FlowTiming {
  return {
    leaveMs: options?.leaveMs ?? DEFAULT_FLOW_TIMING.leaveMs,
    enterMs: options?.enterMs ?? DEFAULT_FLOW_TIMING.enterMs,
    maxWaitMs: options?.maxWaitMs ?? DEFAULT_FLOW_TIMING.maxWaitMs,
  };
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Baja las hojas actuales y, pasado `leaveMs`, muestra el esqueleto de `target` y ejecuta `navigate`. */
function leaveThenNavigate(target: string, path: string, navigate: () => void) {
  document.querySelectorAll(".sheet-card, .sheet-hero").forEach((element) => {
    element.setAttribute("data-flow-leaving", "");
  });
  window.setTimeout(() => {
    setPending(target, path);
    navigate();
  }, timing.leaveMs);
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
  // Solo entre pasos del flujo: desde el menú u otra vista no hay tarjeta que bajar.
  if (!target || !current || current === target || prefersReducedMotion() || pendingStep) {
    navigate();
    return;
  }
  timing = resolveTiming(options);
  leaveThenNavigate(target, toPath, navigate);
}

/* -------------------------------------------------------------------------- */
/* Historial del flujo                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Pila de rutas montadas (la última es la vista actual). Sirve para saber cuál es la vista anterior al volver:
 * el navegador no la expone. Se guarda en sessionStorage para sobrevivir a recargas de la pestaña.
 */
const HISTORY_KEY = "even:flow-history";
const HISTORY_MAX = 50;
let flowHistory: string[] | null = null;
/** Cómo se llegó a la ruta que está por montarse; lo marca quien navega (`markNavigation`) o el `popstate`. */
let navigationKind: "push" | "replace" | "pop" | null = null;
/** Un popstate que no cambia de ruta (cierra un modal) no debe marcar como "volver" una navegación posterior. */
let popExpiresAt = 0;
const POP_KIND_TTL_MS = 3000;
/** Hasta cuándo un `popstate` se considera iniciado por nosotros (`startRouteBack`). */
let ownPopUntil = 0;
const OWN_POP_WINDOW_MS = 2000;

function loadHistory(): string[] {
  if (flowHistory) return flowHistory;
  flowHistory = [];
  try {
    const raw = window.sessionStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) flowHistory = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // sin sessionStorage (modo privado, bloqueado): la pila vive solo en memoria
  }
  return flowHistory;
}

function saveHistory(entries: string[]) {
  flowHistory = entries.slice(-HISTORY_MAX);
  try {
    window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(flowHistory));
  } catch {
    // ver loadHistory
  }
}

function pathnameOf(entry: string) {
  return entry.split("?")[0];
}

/** Quien va a navegar con push/replace lo avisa antes, para que la pila registre bien la ruta nueva. */
export function markNavigation(kind: "push" | "replace") {
  navigationKind = kind;
}

/**
 * Registra la ruta que acaba de montarse (lo llama `RouteTransitionGate`). Según cómo se llegó: push la agrega,
 * replace sustituye la última y volver (popstate) recorta la pila hasta esa ruta. Sin información, se agrega.
 */
export function recordFlowPath(pathname: string, search: string = window.location.search) {
  const entries = [...loadHistory()];
  const kind = navigationKind === "pop" && performance.now() > popExpiresAt ? null : navigationKind;
  navigationKind = null;
  const top = entries[entries.length - 1];
  if (top !== undefined && pathnameOf(top) === pathname) return;
  // Se guarda con la query de cuando se montó: algunas pantallas cambian de forma según `type=`.
  const entry = pathname + search;
  if (kind === "replace") {
    entries[Math.max(entries.length - 1, 0)] = entry;
  } else if (kind === "pop") {
    const at = entries.map(pathnameOf).lastIndexOf(pathname);
    if (at >= 0) entries.length = at + 1;
    else entries.push(entry);
  } else {
    entries.push(entry);
  }
  saveHistory(entries);
}

/** Ruta de la vista anterior del flujo, o null si no se conoce (recarga sin pila, primera vista de la sesión). */
export function getPreviousFlowPath(): string | null {
  const entries = loadHistory();
  if (entries.length < 2) return null;
  // Si la pila no corresponde a la vista actual, es mejor no adivinar.
  if (pathnameOf(entries[entries.length - 1]) !== window.location.pathname) return null;
  return entries[entries.length - 2];
}

/** Vacía la pila (tests, o al terminar la sesión del flujo). */
export function resetFlowHistory() {
  flowHistory = [];
  navigationKind = null;
  ownPopUntil = 0;
  try {
    window.sessionStorage.removeItem(HISTORY_KEY);
  } catch {
    // ver loadHistory
  }
}

/**
 * Volver a la vista anterior del flujo. Si la actual y la anterior son pasos, hace la misma animación que al avanzar
 * (la tarjeta baja y sube el esqueleto de la anterior) y ejecuta `navigateBack` (p. ej. `router.back()`).
 * Si no se conoce la anterior o no es un paso, solo ejecuta `navigateBack` sin animación. El `popstate` que
 * provoca se marca como propio para que `startPopstateListener` no lo anime por segunda vez.
 */
export function startRouteBack(navigateBack: () => void, steps: readonly string[], options?: Partial<FlowTiming>) {
  const previous = getPreviousFlowPath();
  const target = previous ? flowStepOf(previous, steps) : null;
  const current = flowStepOf(window.location.pathname, steps);
  const back = () => {
    navigationKind = "pop";
    popExpiresAt = performance.now() + POP_KIND_TTL_MS;
    ownPopUntil = performance.now() + OWN_POP_WINDOW_MS;
    navigateBack();
  };
  if (!target || !current || current === target || prefersReducedMotion() || pendingStep) {
    back();
    return;
  }
  timing = resolveTiming(options);
  leaveThenNavigate(target, previous ?? "", back);
}

let popstateConfig: { steps: readonly string[]; options?: Partial<FlowTiming> } | null = null;
let popstateAttached = false;

function onPopState() {
  navigationKind = "pop";
  popExpiresAt = performance.now() + POP_KIND_TTL_MS;
  if (performance.now() < ownPopUntil) {
    ownPopUntil = 0;
    return;
  }
  if (!popstateConfig) return;
  const { steps, options } = popstateConfig;
  const entries = loadHistory();
  const origin = entries.length ? flowStepOf(entries[entries.length - 1], steps) : null;
  const target = flowStepOf(window.location.pathname, steps);
  if (!origin || !target || origin === target || prefersReducedMotion()) return;
  timing = resolveTiming(options);
  setPending(target, window.location.pathname + window.location.search);
}

/**
 * El listener se agrega al evaluar el módulo (antes de que Next hidrate y registre el suyo): el router de Next monta
 * la ruta, y el gate la registra, dentro de su propio listener de `popstate`; el nuestro tiene que verlo antes para
 * conocer la vista de origen y marcar que se llegó volviendo.
 */
function attachPopstateListener() {
  if (popstateAttached || typeof window === "undefined") return;
  popstateAttached = true;
  window.addEventListener("popstate", onPopState, true);
}
attachPopstateListener();

/**
 * Activa la animación de `popstate` (gesto de iOS, botón atrás/adelante del navegador). Si no lo iniciamos nosotros
 * y el origen y el destino son pasos del flujo, solo hay fase de entrada: el navegador ya cambió la URL (y el gesto
 * nativo ya animó), así que se muestra de inmediato el esqueleto del paso destino subiendo.
 * Devuelve la función que la desactiva.
 */
export function startPopstateListener(steps: readonly string[], options?: Partial<FlowTiming>): () => void {
  attachPopstateListener();
  const config = { steps, options };
  popstateConfig = config;
  return () => {
    if (popstateConfig === config) popstateConfig = null;
  };
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * Transición menú ⇄ detalle de producto, al estilo de la App Store:
 *  - Al tocar un producto, su foto sale de la tarjeta, sube y crece hasta ocupar el
 *    fondo del detalle, y una hoja blanca crece desde abajo.
 *  - Al volver, la foto regresa a su tarjeta y la hoja baja.
 * Todo ocurre en `DishFlight`, un elemento fijo montado en el layout (fuera de las
 * rutas), así no depende del scroll del menú ni del orden de montaje de las rutas de Next.
 */

export type Rect = { left: number; top: number; width: number; height: number };

export type DishFlightState = {
  mode: "open" | "close";
  id: string;
  src: string;
  /** Caja inicial y final de la foto. */
  from: Rect;
  to: Rect;
  /** Distancia desde el borde superior hasta la hoja blanca. */
  sheetTop: number;
  phase: "start" | "end";
};

type Flight = { id: string; src: string; from: Rect };

let state: DishFlightState | null = null;
let lastFlight: Flight | null = null;
let pageReady = false;
let animDone = false;
let failsafe: number | undefined;
const listeners = new Set<() => void>();

function set(next: DishFlightState | null) {
  state = next;
  window.clearTimeout(failsafe);
  if (next) failsafe = window.setTimeout(() => set(null), 6000);
  listeners.forEach((l) => l());
}

export function useDishFlight(): DishFlightState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => null,
  );
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Foto del producto tocado (para el esqueleto del detalle, que aparece antes de tener datos). */
export function peekDishImage(id: string | number) {
  return lastFlight && lastFlight.id === String(id) ? lastFlight.src : null;
}

// Medidas del detalle (ver page.tsx de dish): foto de 24/28/32rem y hoja bajo el encabezado.
export function dishHeroRect(): Rect {
  const w = window.innerWidth;
  return { left: 0, top: 0, width: w, height: w >= 1024 ? 512 : w >= 768 ? 448 : 384 };
}
export function dishSheetTop(): number {
  const w = window.innerWidth;
  return w >= 1024 ? 476 : w >= 768 ? 396 : 316;
}

function begin(next: Omit<DishFlightState, "phase">) {
  pageReady = next.mode === "close";
  animDone = false;
  set({ ...next, phase: "start" });
  // Dos frames para que el navegador pinte la caja inicial antes de animar a la final.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (state && state.id === next.id && state.phase === "start") set({ ...state, phase: "end" });
    }),
  );
}

/** El usuario tocó el producto: la foto se desprende de la tarjeta y empieza a crecer. */
export function startDishFlight(id: string | number, src: string | null | undefined, card: HTMLElement | null) {
  const image = card?.querySelector<HTMLElement>("[data-menu-image]");
  if (!src || !image || reduced()) return;
  const r = image.getBoundingClientRect();
  const from = { left: r.left, top: r.top, width: r.width, height: r.height };
  lastFlight = { id: String(id), src, from };
  begin({ mode: "open", id: String(id), src, from, to: dishHeroRect(), sheetTop: dishSheetTop() });
}

/** El usuario vuelve al menú: la foto regresa a su tarjeta (el menú restaura su scroll). */
export function startDishClose() {
  if (!lastFlight || reduced()) return;
  const hero = document.querySelector<HTMLElement>("[data-dish-hero]")?.getBoundingClientRect();
  const sheet = document.querySelector<HTMLElement>("[data-dish-sheet]")?.getBoundingClientRect();
  const from = hero ? { left: hero.left, top: hero.top, width: hero.width, height: hero.height } : dishHeroRect();
  begin({
    mode: "close",
    id: lastFlight.id,
    src: lastFlight.src,
    from,
    to: lastFlight.from,
    sheetTop: Math.max(0, sheet?.top ?? dishSheetTop()),
  });
}

function maybeFinish() {
  if (state && state.phase === "end" && animDone && pageReady) set(null);
}

/** El detalle ya tiene su contenido real: se puede retirar la foto en vuelo. */
export function markDishReady() {
  pageReady = true;
  maybeFinish();
}

/** Terminó la animación de la foto. */
export function markDishAnimationDone() {
  if (state?.phase !== "end") return;
  animDone = true;
  maybeFinish();
}

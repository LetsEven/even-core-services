"use client";

import { useEffect, useRef, useState } from "react";

/** Porcentajes de propina rápidos de la división en partes iguales (además del campo libre). */
export const EQUAL_SPLIT_TIP_OPTIONS = [0, 10, 15, 20];
export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 50;
// A partir de aquí el anillo se queda en este número de segmentos.
export const MAX_RING_SEGMENTS = 15;

export const RING_RADIUS = 86;
export const RING_STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const TWEEN_MS = 320;

export type RingSegment = { start: number; length: number };

export interface RingGeometry {
  slice: number;
  yours: RingSegment;
  rest: RingSegment[];
  /** Separación entre segmentos: se achica con muchos para que sigan visibles. */
  gapFull: number;
}

/** Reparte el perímetro del anillo entre `p` personas (p puede ser fraccionario durante la animación). */
export function ringSegments(p: number): Omit<RingGeometry, "gapFull"> {
  const slice = CIRCUMFERENCE / p;
  const full = Math.floor(p);
  const rest: RingSegment[] = [];
  for (let i = 1; i < full; i++) rest.push({ start: i * slice, length: slice });
  const partial = CIRCUMFERENCE - full * slice;
  if (partial > 0.01) rest.push({ start: full * slice, length: partial });
  return { slice, yours: { start: 0, length: slice }, rest };
}

export const RING_CIRCUMFERENCE = CIRCUMFERENCE;

// Interpola el número de personas para que el anillo se reparta de forma
// continua (el segmento nuevo crece desde 0) en vez de empalmar arcos.
function useTweened(target: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min((now - start) / TWEEN_MS, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

/** Geometría animada del anillo para `people` personas. */
export function useSplitRing(people: number): RingGeometry {
  const { slice, yours, rest } = ringSegments(useTweened(Math.min(people, MAX_RING_SEGMENTS)));
  return { slice, yours, rest, gapFull: RING_STROKE + Math.min(12, slice * 0.15) };
}

/** Acepta solo números con un punto decimal opcional (o vacío) en el campo de propina libre. */
export function isValidTipInput(value: string): boolean {
  return value === "" || /^\d*\.?\d*$/.test(value);
}

/**
 * Lógica de la división en partes iguales: límites del selector de personas y propina rápida.
 * La presentación (`EqualSplitView`) solo pinta lo que devuelve.
 */
export function useEqualSplit({
  people,
  onPeopleChange,
}: {
  people: number;
  onPeopleChange: (people: number) => void;
}) {
  return {
    tipOptions: EQUAL_SPLIT_TIP_OPTIONS,
    canDecrement: people > MIN_PEOPLE,
    canIncrement: people < MAX_PEOPLE,
    decrement: () => onPeopleChange(Math.max(MIN_PEOPLE, people - 1)),
    increment: () => onPeopleChange(Math.min(MAX_PEOPLE, people + 1)),
  };
}

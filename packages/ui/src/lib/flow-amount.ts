"use client";

import { useSyncExternalStore } from "react";

/**
 * Monto vivo del flujo de pago ("Monto protagonista"). La vista real publica aquí el mismo valor que usa su tarjeta
 * (el que cobra el botón de pagar) y el hero del paso (`AmountHero`) solo lo lee: así hero y tarjeta no pueden
 * diferir ni se recalcula nada por separado. Ya viene formateado, para que el core no dependa de i18n.
 */
export type FlowAmount = {
  /** Monto grande: "$50.60". */
  total: string;
  /** Desglose bajo el monto: "Cuenta $46.00 + propina $4.60". */
  breakdown?: string;
  /** Etiqueta sobre el monto cuando no es la de la pantalla ("Total a pagar"). */
  label?: string;
};

let current: FlowAmount | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Publica (o retira con `null`) el monto del paso actual. Sin cambios reales no notifica. */
export function setFlowAmount(next: FlowAmount | null) {
  if (
    current === next ||
    (current &&
      next &&
      current.total === next.total &&
      current.breakdown === next.breakdown &&
      current.label === next.label)
  ) {
    return;
  }
  current = next;
  emit();
}

/** Monto publicado por la vista actual, o null mientras no lo haya (esqueleto, carga). */
export function useFlowAmountValue(): FlowAmount | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}

/** "$50.60": formato único de los montos del hero y de los botones de pagar. */
export function formatMoney(amount: number): string {
  return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}

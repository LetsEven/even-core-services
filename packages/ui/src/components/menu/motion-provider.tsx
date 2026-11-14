"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";

const loadFeatures = () => import("../../lib/motion-features").then((mod) => mod.default);

/**
 * Carga `motion` bajo demanda y respeta `prefers-reduced-motion` (sin movimiento; solo fundidos).
 * Los componentes animados de @even/ui lo usan por dentro: la app no tiene que montarlo.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Resorte común de la familia: rápido, sin rebote exagerado. */
export const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;

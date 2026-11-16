"use client";

import type { ComponentProps } from "react";
import { m } from "motion/react";

/**
 * Raíz de la página de detalle de producto. `layoutRoot` aísla las animaciones de layout del
 * detalle (la foto y la hoja en vuelo de `DishFlight`) del resto de la página.
 */
export function DishScreen(props: ComponentProps<typeof m.div>) {
  return <m.div layoutRoot {...props} />;
}

/** Hoja blanca del detalle; `data-dish-sheet` es el ancla que lee `startDishClose` para animar el regreso. */
export function DishSheet(props: ComponentProps<typeof m.main>) {
  return <m.main data-dish-sheet {...props} />;
}

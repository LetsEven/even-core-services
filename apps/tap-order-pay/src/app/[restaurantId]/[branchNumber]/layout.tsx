import type { ReactNode } from "react";
import { DishFlight, MotionProvider } from "@even/ui";
import FlowTransition from "@/components/FlowTransition";

/**
 * La foto y la hoja en vuelo del detalle de producto (`DishFlight`) viven aquí, fuera de las
 * rutas, para sobrevivir al cambio menú ⇄ detalle. `FlowTransition` envuelve todo el flujo de compra:
 * transición de tarjeta, historial y esqueleto del paso destino.
 */
export default function BranchLayout({ children }: { children: ReactNode }) {
  return (
    <FlowTransition>
      <MotionProvider>
        {children}
        <DishFlight />
      </MotionProvider>
    </FlowTransition>
  );
}

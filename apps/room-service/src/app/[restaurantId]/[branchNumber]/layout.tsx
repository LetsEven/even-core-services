import type { ReactNode } from "react";
import { DishFlight, MotionProvider } from "@even/ui";
import FlowNavOverlay from "@/components/FlowNavOverlay";

/**
 * La foto y la hoja en vuelo del detalle de producto (`DishFlight`) viven aquí, fuera de las
 * rutas, para sobrevivir al cambio menú ⇄ detalle.
 */
export default function BranchLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MotionProvider>
        {children}
        <DishFlight />
      </MotionProvider>
      <FlowNavOverlay />
    </>
  );
}

import type { ReactNode } from "react";
import FlowTransition from "@/app/components/FlowTransition";

/** Transición de tarjeta entre los pasos del pago: historial, esqueleto del paso destino y navegación. */
export default function BranchLayout({ children }: { children: ReactNode }) {
  return <FlowTransition>{children}</FlowTransition>;
}

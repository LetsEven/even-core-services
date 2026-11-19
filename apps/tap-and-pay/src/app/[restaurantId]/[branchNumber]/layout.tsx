import type { ReactNode } from "react";
import FlowNavOverlay from "@/app/components/FlowNavOverlay";

/** El esqueleto de la transición entre pasos del pago vive fuera de las rutas, para sobrevivir al cambio. */
export default function BranchLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <FlowNavOverlay />
    </>
  );
}

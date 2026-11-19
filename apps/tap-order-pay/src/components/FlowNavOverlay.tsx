"use client";

import { FlowNavOverlay as SharedFlowNavOverlay, type FlowScreen } from "@even/ui";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { CardSelectionBody, CartBody, OrderConfirmBody, useFlowHero } from "@/components/flow-skeletons";
import type { FlowStep } from "@/lib/flow-steps";

/**
 * Esqueleto del paso destino (carrito → confirmación → pago). Reutiliza los mismos cuerpos que las vistas
 * reales mientras cargan (ver `flow-skeletons`), así la tarjeta no cambia de altura al llegar la ruta.
 */
export default function FlowNavOverlay() {
  const cart = useFlowHero("cart");
  const confirm = useFlowHero("order-confirm");
  const pay = useFlowHero("card-selection");

  const screens: Record<FlowStep, FlowScreen> = {
    cart: { ...cart, body: <CartBody /> },
    // La confirmación real es una tarjeta del alto de su contenido, anclada abajo.
    "order-confirm": { ...confirm, body: <OrderConfirmBody />, layout: "anchored" },
    "card-selection": { ...pay, body: <CardSelectionBody /> },
  };

  return <SharedFlowNavOverlay screens={screens} header={<MenuHeaderBack onBack={() => {}} />} />;
}

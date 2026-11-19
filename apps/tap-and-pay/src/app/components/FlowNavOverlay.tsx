"use client";

import { FlowNavOverlay as SharedFlowNavOverlay, type FlowScreen } from "@even/ui";
import MenuHeader from "@/app/components/headers/MenuHeader";
import { CardSelectionBody, PaymentOptionsBody, StepHero, TipBody } from "@/app/components/flow-skeletons";
import type { FlowStep } from "@/app/utils/flow-steps";

/**
 * Esqueleto del paso destino mientras carga la ruta (opciones de pago → propina → pago).
 * Cambia de paso con la misma animación que Pick & Go (`startRouteTransition`, ver `useTableNavigation`).
 */
export default function FlowNavOverlay() {
  const screens: Record<FlowStep, FlowScreen> = {
    "payment-options": { hero: <StepHero step="payment-options" />, body: <PaymentOptionsBody /> },
    // La propina real es una tarjeta del alto de su contenido pegada abajo, dentro de un margen lateral.
    "tip-selection": {
      hero: <StepHero step="tip-selection" />,
      body: <TipBody />,
      layout: "anchored",
      cardClassName: "flex-none pt-8 pb-4 md:pt-10 md:pb-6 lg:pt-12",
      frameClassName: "px-4 md:px-6 lg:px-8",
    },
    "card-selection": {
      hero: <StepHero step="card-selection" />,
      body: <CardSelectionBody />,
      frameClassName: "px-4 md:px-6 lg:px-8",
    },
  };

  return <SharedFlowNavOverlay screens={screens} header={<MenuHeader />} />;
}

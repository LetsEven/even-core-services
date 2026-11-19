"use client";

import { FlowNavOverlay as SharedFlowNavOverlay, type FlowScreen } from "@even/ui";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import {
  CardSelectionBody,
  CartBody,
  FlowStepHero,
  PaymentOptionsBody,
  TipBody,
} from "@/app/components/flow-skeletons";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useTable } from "@/app/context/TableContext";
import type { FlowStep } from "@/app/utils/flow-steps";

/**
 * Esqueleto del paso destino (carrito → opciones de pago → propina → pago). Reutiliza los mismos cuerpos que
 * las vistas reales mientras cargan (ver `flow-skeletons`), así la tarjeta no cambia de altura al llegar la ruta.
 */
export default function FlowNavOverlay() {
  const { restaurant } = useRestaurant();
  const { state: tableState } = useTable();

  const screens: Record<FlowStep, FlowScreen> = {
    cart: { hero: <FlowStepHero step="cart" />, body: <CartBody /> },
    "payment-options": { hero: <FlowStepHero step="payment-options" />, body: <PaymentOptionsBody /> },
    // La propina real es una tarjeta del alto de su contenido pegada abajo y a todo el ancho.
    "tip-selection": {
      hero: <FlowStepHero step="tip-selection" />,
      body: <TipBody />,
      layout: "anchored",
      // px-0: el cuerpo de la propina trae su propio relleno lateral (px-8…).
      cardClassName: "flex-none px-0 md:px-0 lg:px-0 pt-8 pb-4 md:pt-10 md:pb-6 lg:pt-12",
    },
    "card-selection": { hero: <FlowStepHero step="card-selection" />, body: <CardSelectionBody /> },
  };

  return (
    <SharedFlowNavOverlay
      screens={screens}
      header={
        restaurant ? (
          <MenuHeaderBack restaurant={restaurant} tableNumber={tableState.tableNumber} onBack={() => {}} />
        ) : null
      }
    />
  );
}

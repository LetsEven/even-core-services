"use client";

import { useTranslations } from "next-intl";
import { FlowNavOverlay as SharedFlowNavOverlay, FlowSkeletonBody, FlowTitle, type FlowScreen } from "@even/ui";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useTable } from "@/app/context/TableContext";

/**
 * Esqueleto del paso destino mientras carga la ruta (carrito → opciones de pago → propina → pago).
 * Cambia de paso con la misma animación que Pick & Go (`startRouteTransition`, ver `useTableNavigation`).
 */
export default function FlowNavOverlay() {
  const { restaurant } = useRestaurant();
  const { state: tableState } = useTable();
  const cart = useTranslations("CartView");
  const options = useTranslations("PaymentOptionsPage");
  const tip = useTranslations("TipSelectionPage");
  const pay = useTranslations("CardSelectionPage");

  const screens: Record<string, FlowScreen> = {
    cart: { hero: <FlowTitle>{cart("confirmYourOrder")}</FlowTitle>, body: <FlowSkeletonBody rows={2} /> },
    "payment-options": { hero: <FlowTitle>{options("title")}</FlowTitle>, body: <FlowSkeletonBody rows={3} /> },
    "tip-selection": { hero: <FlowTitle>{tip("title")}</FlowTitle>, body: <FlowSkeletonBody rows={4} /> },
    "card-selection": { hero: <FlowTitle>{pay("selectPaymentMethodTitle")}</FlowTitle>, body: <FlowSkeletonBody rows={3} /> },
  };

  return <SharedFlowNavOverlay screens={screens} header={restaurant ? <MenuHeaderBack restaurant={restaurant} tableNumber={tableState.tableNumber} onBack={() => {}} /> : null} />;
}

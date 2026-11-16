"use client";

import { useTranslations } from "next-intl";
import { FlowNavOverlay as SharedFlowNavOverlay, FlowSkeletonBody, FlowTitle, type FlowScreen } from "@even/ui";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";

/**
 * Esqueleto del paso destino mientras carga la ruta (carrito → confirmación → pago).
 * Cambia de paso con la misma animación que Pick & Go (`startRouteTransition`, ver los hooks de navegación).
 */
export default function FlowNavOverlay() {
  const cart = useTranslations("CartView");
  const confirm = useTranslations("OrderConfirmPage");
  const pay = useTranslations("CardSelectionPage");

  const screens: Record<string, FlowScreen> = {
    cart: { hero: <FlowTitle>{cart("confirmYourOrder")}</FlowTitle>, body: <FlowSkeletonBody rows={2} /> },
    "order-confirm": {
      hero: <FlowTitle>{confirm("title")}</FlowTitle>,
      body: <FlowSkeletonBody rows={4} />,
      cardClassName: "flex-none py-8",
      anchored: true,
    },
    "card-selection": { hero: <FlowTitle>{pay("selectPaymentMethodTitle")}</FlowTitle>, body: <FlowSkeletonBody rows={3} /> },
  };

  return <SharedFlowNavOverlay screens={screens} header={<MenuHeaderBack onBack={() => {}} />} />;
}

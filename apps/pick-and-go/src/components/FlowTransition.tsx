"use client";

import { addCardScreen, cardSelectionScreen, cartScreen, orderConfirmScreen } from "@even/ui";
import { FlowTransitionProvider } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { FLOW_STEPS } from "@/lib/flow-steps";

/**
 * Animación de tarjeta del flujo de compra de Pick & Go: aquí solo se declaran los pasos, sus textos y la
 * cabecera; el motor, el esqueleto y la navegación viven en `@even/ui` y `@even/ui/diner`.
 */
export default function FlowTransition({ children }: { children: ReactNode }) {
  const tc = useTranslations("Common");
  const cart = useTranslations("CartView");
  const confirm = useTranslations("OrderConfirmPage");
  const pay = useTranslations("CardSelectionPage");
  const addCard = useTranslations("AddCardPage");

  const screens = {
    cart: cartScreen({
      context: "Pick & Go",
      title: cart("confirmYourOrder"),
      labels: { myCart: cart("myCart") },
    }),
    "order-confirm": orderConfirmScreen({
      title: confirm("title"),
      labels: {
        branch: tc("branchLabel"),
        subtotal: tc("subtotal"),
        tip: tc("tip"),
        totalToPay: tc("totalToPay"),
        continueCta: confirm("continueCta"),
      },
    }),
    "card-selection": cardSelectionScreen({
      title: pay("selectPaymentMethodTitle"),
      labels: { subtotal: tc("subtotal"), totalToPay: tc("totalToPay"), paymentMethods: pay("paymentMethodsLabel") },
    }),
    "add-card": addCardScreen({
      title: addCard("title"),
      subtitle: addCard("subtitle"),
      labels: {
        fullName: addCard("fullNameLabel"),
        cardNumber: addCard("cardNumberLabel"),
        expiry: addCard("expiryLabel"),
        saveCta: addCard("saveCta"),
      },
    }),
  } satisfies Record<(typeof FLOW_STEPS)[number], unknown>;

  return (
    <FlowTransitionProvider steps={FLOW_STEPS} screens={screens} header={<MenuHeaderBack onBack={() => {}} />}>
      {children}
    </FlowTransitionProvider>
  );
}

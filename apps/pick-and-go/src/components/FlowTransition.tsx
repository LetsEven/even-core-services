"use client";

import { addCardScreen, cardSelectionScreen, cartScreen, orderConfirmScreen } from "@even/ui";
import { FlowTransitionProvider, useAuthScreen } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { useAuthLoginCopy, useAuthSelectionCopy } from "@/hooks/useAuthCopy";
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
  // "auth-selection" es solo inicio de sesión (con textos propios); "auth" (menú / panel) muestra el número de ejemplo.
  const authSelection = useAuthScreen("selection", { copy: useAuthSelectionCopy() });
  const authLogin = useAuthScreen("login", { example: true, copy: useAuthLoginCopy() });

  const context = "Pick & Go";
  const payCta = tc("payCtaAmount", { amount: "$000.00" });

  const screens = {
    cart: cartScreen({
      context,
      title: cart("confirmYourOrder"),
      labels: { myCart: cart("myCart") },
    }),
    "order-confirm": orderConfirmScreen({
      context,
      title: confirm("title"),
      amountLabel: tc("totalToPay"),
      labels: { branch: tc("branchLabel"), tip: tc("tip"), payCta },
    }),
    "card-selection": cardSelectionScreen({
      context,
      title: pay("selectPaymentMethodTitle"),
      amountLabel: tc("totalToPay"),
      labels: { paymentMethods: pay("paymentMethodsLabel"), payCta },
    }),
    "add-card": addCardScreen({
      context,
      title: addCard("title"),
      subtitle: addCard("subtitle"),
      labels: {
        fullName: addCard("fullNameLabel"),
        cardNumber: addCard("cardNumberLabel"),
        expiry: addCard("expiryLabel"),
        saveCta: addCard("saveCta"),
      },
    }),
    "auth-selection": authSelection,
    auth: authLogin,
  } satisfies Record<(typeof FLOW_STEPS)[number], unknown>;

  return (
    <FlowTransitionProvider steps={FLOW_STEPS} screens={screens} header={<MenuHeaderBack onBack={() => {}} />}>
      {children}
    </FlowTransitionProvider>
  );
}

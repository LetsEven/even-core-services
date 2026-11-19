"use client";

import {
  addCardScreen,
  cardSelectionScreen,
  cartScreen,
  orderConfirmScreen,
  userScreen,
} from "@even/ui";
import { FlowTransitionProvider, useAuthScreen, useTermsText } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { useTable } from "@/context/TableContext";
import { FLOW_STEPS } from "@/lib/flow-steps";

/**
 * Animación de tarjeta del flujo de compra: aquí solo se declaran los pasos, sus textos y la cabecera;
 * el motor, el esqueleto y la navegación viven en `@even/ui` y `@even/ui/diner`.
 */
export default function FlowTransition({ children }: { children: ReactNode }) {
  const { state } = useTable();
  const tc = useTranslations("Common");
  const cart = useTranslations("CartView");
  const confirm = useTranslations("OrderConfirmPage");
  const pay = useTranslations("CardSelectionPage");
  const user = useTranslations("UserPage");
  const addCard = useTranslations("AddCardPage");
  const terms = useTermsText();
  // Ambas pantallas de acceso llevan "Continuar como invitado".
  const authSelection = useAuthScreen("selection", { guest: true });
  const authLogin = useAuthScreen("login", { guest: true });

  const screens = {
    cart: cartScreen({
      context: tc("tableLabel", { table: state.tableNumber ?? "" }),
      title: cart("confirmYourOrder"),
      labels: { myCart: cart("myCart") },
    }),
    "order-confirm": orderConfirmScreen({
      title: confirm("title"),
      labels: {
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
    user: userScreen({
      title: user("title"),
      labels: { name: user("nameLabel"), terms, continueCta: user("continueCta") },
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
    "auth-selection": authSelection,
    auth: authLogin,
  } satisfies Record<(typeof FLOW_STEPS)[number], unknown>;

  return (
    <FlowTransitionProvider steps={FLOW_STEPS} screens={screens} header={<MenuHeaderBack onBack={() => {}} />}>
      {children}
    </FlowTransitionProvider>
  );
}

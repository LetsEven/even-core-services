"use client";

import {
  addCardScreen,
  cardSelectionScreen,
  cartScreen,
  chooseAmountScreen,
  paymentOptionsScreen,
  selectItemsScreen,
  tipScreen,
  userScreen,
  type FlowScreenSource,
} from "@even/ui";
import { FlowTransitionProvider, useEqualSplitScreen, useTermsText } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useTable } from "@/app/context/TableContext";
import { FLOW_STEPS } from "@/app/utils/flow-steps";

/**
 * Animación de tarjeta del flujo de pago de FlexBill: aquí solo se declaran los pasos, sus textos y la cabecera;
 * el motor, el esqueleto y la navegación viven en `@even/ui` y `@even/ui/diner`.
 */
export default function FlowTransition({ children }: { children: ReactNode }) {
  const { restaurant } = useRestaurant();
  const { state } = useTable();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;
  // La mesa ya se cargó en el paso anterior: el esqueleto de "seleccionar artículos" lleva tantas filas como platillos.
  const unpaidDishes = (state.dishOrders ?? []).filter((dish) => dish.payment_status !== "paid").length;
  const tc = useTranslations("Common");
  const cart = useTranslations("CartView");
  const options = useTranslations("PaymentOptionsPage");
  const tip = useTranslations("TipSelectionPage");
  const pay = useTranslations("CardSelectionPage");
  const user = useTranslations("UserPage");
  const addCard = useTranslations("AddCardPage");
  const terms = useTermsText();
  const equalSplit = useEqualSplitScreen(state.tableNumber);

  const context = tc("tableLabel", { table: state.tableNumber });
  const contextClassName = "text-white/60";
  const tipLabels = { total: tip("totalLabel"), tip: tip("tipLabel"), totalToPay: tip("totalToPay"), payCta: tip("payCta") };
  const tipProps = { context, contextClassName, title: tip("title") };
  const tipPlain = tipScreen({ ...tipProps, labels: tipLabels });
  const tipChooseAmount = chooseAmountScreen({
    ...tipProps,
    labels: tipLabels,
    amountLabels: { amountToPay: tip("amountToPayLabel"), maximum: tip("maximumLabel", { amount: "000.00" }) },
  });
  const tipSelectItems = selectItemsScreen({
    ...tipProps,
    labels: { ...tipLabels, qty: tip("qtyLabel"), price: tip("priceLabel"), hint: tip("selectItemToContinue") },
    showImages,
    rows: unpaidDishes || undefined,
  });

  const screens: Record<(typeof FLOW_STEPS)[number], FlowScreenSource> = {
    cart: cartScreen({ context, contextClassName, title: cart("confirmYourOrder"), labels: { myCart: cart("myCart") } }),
    "payment-options": paymentOptionsScreen({ title: options("title") }),
    // La propina cambia de forma según lo que se paga (`type=`): dividir cuenta, elegir monto o artículos.
    "tip-selection": ({ params }) => {
      switch (params.get("type")) {
        case "equal-shares":
          return equalSplit;
        case "choose-amount":
          return tipChooseAmount;
        case "select-items":
          return tipSelectItems;
        default:
          return tipPlain;
      }
    },
    "card-selection": cardSelectionScreen({
      title: pay("selectPaymentMethodTitle"),
      showSubtotal: false,
      labels: { subtotal: tc("subtotal"), totalToPay: pay("totalToPay"), paymentMethods: pay("paymentMethodsLabel") },
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
  };

  return (
    <FlowTransitionProvider
      steps={FLOW_STEPS}
      screens={screens}
      header={
        restaurant ? (
          <MenuHeaderBack restaurant={restaurant} tableNumber={state.tableNumber} onBack={() => {}} />
        ) : null
      }
    >
      {children}
    </FlowTransitionProvider>
  );
}

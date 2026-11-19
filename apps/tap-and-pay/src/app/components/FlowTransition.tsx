"use client";

import {
  addCardScreen,
  cardSelectionScreen,
  chooseAmountScreen,
  Ghost,
  paymentOptionsScreen,
  selectItemsScreen,
  TitleHero,
  tipScreen,
  userScreen,
  type FlowScreen,
  type FlowScreenSource,
} from "@even/ui";
import { FlowTransitionProvider, useAuthScreen, useEqualSplitScreen, useTermsText } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import MenuHeader from "@/app/components/headers/MenuHeader";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { FLOW_STEPS } from "@/app/utils/flow-steps";

/**
 * Cuenta de la mesa (primer paso de Tap & Pay): título, "Cuenta de la mesa", filas de platillos y el total fijo
 * abajo. Es la única pantalla propia de esta app; el resto sale de las pantallas compartidas de `@even/ui`.
 */
function useOrderScreen(context: ReactNode): FlowScreen {
  const t = useTranslations("OrderPage");
  const tc = useTranslations("Common");
  return {
    hero: <TitleHero context={context} title={t("subtitle")} />,
    body: (
      <>
        <div className="flex-1 overflow-y-auto pb-45 md:pb-50 lg:pb-55">
          <div className="mx-auto w-full pb-6 md:pb-8">
            <div className="relative mt-6 flex items-start justify-center md:mt-8">
              <p className="rounded-full border border-stroke bg-surface px-3 py-1 text-base font-medium text-black md:px-4 md:py-1.5 md:text-lg lg:px-5 lg:text-xl">
                {t("tableBillTitle")}
              </p>
            </div>
            <div className="mt-4 divide-y divide-stroke/50">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center justify-between py-3 md:py-4 lg:py-5">
                  <div className="flex items-center gap-3 md:gap-4 lg:gap-5">
                    <div className="size-16 shrink-0 animate-pulse rounded-sm bg-tone-100 md:size-20 md:rounded-md lg:size-24" />
                    <Ghost className="text-base md:text-lg lg:text-xl">Platillo</Ghost>
                  </div>
                  <Ghost className="text-base md:text-lg lg:text-xl">1 $000.00</Ghost>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="fixed fixed-col bottom-0 z-10 bg-white px-6 pt-4 pb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:px-8 lg:px-10">
          <div className="space-y-3 pt-4 md:space-y-4">
            <div className="flex items-center justify-between text-base font-medium text-black md:text-lg lg:text-xl">
              <span>{tc("subtotal")}</span>
              <Ghost>$000.00 MXN</Ghost>
            </div>
            <div className="flex items-center justify-between text-base font-bold text-black md:text-lg lg:text-xl">
              <span>{t("totalLabel")}</span>
              <Ghost>$000.00 MXN</Ghost>
            </div>
          </div>
          <div className="mt-5 w-full animate-pulse rounded-full bg-even-grass/40 py-3 text-base md:mt-6 md:py-4 md:text-lg lg:mt-7 lg:py-5 lg:text-xl">
            <span className="invisible block text-center">{tc("continueCta")}</span>
          </div>
        </div>
      </>
    ),
  };
}

/**
 * Animación de tarjeta del flujo de pago de Tap & Pay: aquí solo se declaran los pasos, sus textos y la cabecera;
 * el motor, el esqueleto y la navegación viven en `@even/ui` y `@even/ui/diner`.
 */
export default function FlowTransition({ children }: { children: ReactNode }) {
  const { tableNumber } = useTableNavigation();
  const { state } = useTable();
  const { restaurant } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;
  // La cuenta ya se cargó en el paso anterior: el esqueleto de "seleccionar artículos" lleva tantas filas como platillos.
  const unpaidDishes = (state.order?.items ?? []).filter((dish) => dish.payment_status !== "paid").length;
  const tc = useTranslations("Common");
  const options = useTranslations("PaymentOptionsPage");
  const tip = useTranslations("TipSelectionPage");
  const pay = useTranslations("CardSelectionPage");
  const user = useTranslations("UserPage");
  const addCard = useTranslations("AddCardPage");
  const terms = useTermsText();
  const equalSplit = useEqualSplitScreen(tableNumber);
  const context = tc("tableLabel", { table: tableNumber ?? "" });
  const order = useOrderScreen(context);
  // "auth-selection" lleva "Continuar como invitado"; "auth" (menú / tras pagar) muestra el número de ejemplo.
  const authSelection = useAuthScreen("selection", { guest: true });
  const authLogin = useAuthScreen("login", { example: true });

  const payCta = tc("payCtaAmount", { amount: "$000.00" });
  const tipLabels = { tip: tip("tipLabel"), payCta };
  const tipProps = { context, title: tip("subtitle"), amountLabel: tc("totalToPay") };
  const tipPlain = tipScreen({ ...tipProps, labels: tipLabels });
  const tipChooseAmount = chooseAmountScreen({
    ...tipProps,
    labels: tipLabels,
    amountLabels: { amountToPay: tip("amountToPayLabel"), maximum: tip("maxAmount", { amount: "000.00" }) },
    spaced: true,
  });
  const tipSelectItems = selectItemsScreen({
    ...tipProps,
    labels: { ...tipLabels, qty: tc("qtyLabel"), price: tc("priceLabel"), hint: tip("selectItemToContinue") },
    showImages,
    showGuest: false,
    rows: unpaidDishes || undefined,
  });

  const screens: Record<(typeof FLOW_STEPS)[number], FlowScreenSource> = {
    order,
    "payment-options": paymentOptionsScreen({ context, title: options("subtitle"), amountLabel: options("heroLabel") }),
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
      context,
      title: pay("selectPaymentMethodTitle"),
      amountLabel: tc("totalToPay"),
      labels: { paymentMethods: pay("paymentMethodsLabel"), payCta },
    }),
    user: userScreen({
      context,
      title: user("title"),
      labels: { name: user("nameLabel"), terms, continueCta: tc("continueCta") },
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
  };

  return (
    <FlowTransitionProvider steps={FLOW_STEPS} screens={screens} header={<MenuHeader />}>
      {children}
    </FlowTransitionProvider>
  );
}

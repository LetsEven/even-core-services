"use client";

import {
  addCardScreen,
  cardSelectionScreen,
  cartScreen,
  chooseAmountScreen,
  Ghost,
  paymentOptionsScreen,
  ReceiptPaper,
  ReceiptRow,
  ReceiptRule,
  selectItemsScreen,
  StepHero,
  tipScreen,
  userScreen,
  type FlowScreen,
  type FlowScreenSource,
} from "@even/ui";
import { FlowTransitionProvider, useAuthScreen, useEqualSplitScreen, useTermsText } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useTable } from "@/app/context/TableContext";
import { FLOW_STEPS } from "@/app/utils/flow-steps";

/** Clases de la tarjeta de la cuenta: verde con el ticket encima (blanca cuando la mesa ya está cerrada). */
export const ORDER_CARD_CLASS = "overflow-hidden bg-even-evergreen px-0 md:px-0 lg:px-0";

/**
 * Cuenta de la mesa: título, ticket con una fila por platillo sin pagar y la barra fija de subtotal y "Continuar".
 * Es la única pantalla propia de FlexBill; el resto sale de las pantallas compartidas de `@even/ui`.
 */
function useOrderScreen(context: ReactNode, rows: number, closed: boolean): FlowScreen {
  const t = useTranslations("OrderStatus");
  const hero = <StepHero label={context} labelClassName="text-white/60" title={t("subtitle")} />;
  // Mesa ya pagada: la vista real es un aviso centrado; no hay ticket que imitar.
  if (closed) return { hero, body: <div className="flex-1" /> };
  return {
    hero,
    cardClassName: ORDER_CARD_CLASS,
    body: (
      <>
        <div className="flex-1 overflow-y-auto px-3 pt-6 pb-35 md:px-6 md:pb-40 lg:pb-45">
          <div className="mx-auto w-full max-w-xl">
            <ReceiptPaper mode="static">
              <div className="min-w-0">
                <Ghost className="font-mono text-base font-bold uppercase">Restaurante</Ghost>
                <p className="text-xs">
                  <Ghost>Cuenta Compartida · Mesa 00</Ghost>
                </p>
              </div>
              <ReceiptRule />
              {Array.from({ length: Math.max(rows, 1) }, (_, row) => (
                <ReceiptRow
                  key={row}
                  left={<Ghost>1x Platillo del menú</Ghost>}
                  right={<Ghost>$000.00</Ghost>}
                  sub={<Ghost>Invitado · pendiente</Ghost>}
                />
              ))}
              <ReceiptRule />
              <ReceiptRow strong left={t("subtotal")} right={<Ghost>$000.00</Ghost>} />
            </ReceiptPaper>
          </div>
        </div>
        <div className="fixed fixed-col bottom-0 z-50 mx-4 border-t border-white/10 bg-even-evergreen px-6 md:mx-6 md:px-8 lg:mx-8 lg:px-10">
          <div className="flex items-center justify-between pt-4 text-base font-medium md:text-lg lg:text-xl">
            <span className="text-white/70">{t("subtotal")}</span>
            <Ghost className="text-white">$000.00 MXN</Ghost>
          </div>
          <div className="mt-4 w-full animate-pulse rounded-full bg-even-grass/40 py-3 text-base md:mt-5 md:py-4 md:text-lg lg:py-5 lg:text-xl">
            <span className="invisible block text-center">{t("continueCta")}</span>
          </div>
          <div style={{ height: "max(1.5rem, env(safe-area-inset-bottom))" }} />
        </div>
      </>
    ),
  };
}

/**
 * Animación de tarjeta del flujo de FlexBill: aquí solo se declaran los pasos, sus textos y la cabecera;
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
  const order = useOrderScreen(
    tc("tableLabel", { table: state.tableNumber }),
    unpaidDishes,
    state.tableSummary?.data?.data?.status === "paid",
  );
  // Inicio de sesión: "auth-selection" (con "Continuar como invitado") desde la cuenta; "auth" desde el menú o tras pagar.
  const authSelection = useAuthScreen("selection", { guest: true });
  const authLogin = useAuthScreen("login", { example: true });

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
    order,
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
    "auth-selection": authSelection,
    auth: authLogin,
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

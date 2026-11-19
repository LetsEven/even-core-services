"use client";

import {
  CardSelectionSkeleton,
  CartSkeleton,
  FlowHeroBlock,
  PaymentOptionsSkeleton,
  StepHero,
  TipSkeleton,
} from "@even/ui";
import { useTranslations } from "next-intl";
import { useTable } from "@/app/context/TableContext";
import type { FlowStep } from "@/app/utils/flow-steps";

/**
 * Esqueletos del flujo de pago (carrito → opciones → propina → pago). Los cuerpos viven en `@even/ui` y se
 * comparten con las demás apps; aquí solo se les pasan los textos de FlexBill. Los usan el `FlowNavOverlay`
 * de la transición y las propias vistas mientras cargan, así la tarjeta mide lo mismo que la real.
 */

/** Título del paso con la misma tipografía y márgenes que la vista real (el bloque lo pone `FlowCard`). */
export function FlowStepHero({ step }: { step: FlowStep }) {
  const cart = useTranslations("CartView");
  const options = useTranslations("PaymentOptionsPage");
  const tip = useTranslations("TipSelectionPage");
  const pay = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  const { state } = useTable();
  const label = tc("tableLabel", { table: state.tableNumber });

  switch (step) {
    case "cart":
      return <StepHero label={label} labelClassName="text-white/60" title={cart("confirmYourOrder")} />;
    case "tip-selection":
      return <StepHero label={label} labelClassName="text-white/60" title={tip("title")} />;
    case "payment-options":
      return <StepHero title={options("title")} />;
    default:
      return <StepHero title={pay("selectPaymentMethodTitle")} />;
  }
}

/** Título de un paso como bloque completo, para las vistas reales mientras cargan. */
export function FlowHero({ step }: { step: FlowStep }) {
  return (
    <FlowHeroBlock>
      <FlowStepHero step={step} />
    </FlowHeroBlock>
  );
}

export function CartBody() {
  const t = useTranslations("CartView");
  return <CartSkeleton labels={{ myCart: t("myCart") }} />;
}

export const PaymentOptionsBody = PaymentOptionsSkeleton;
export const TipBody = TipSkeleton;

export function CardSelectionBody() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  return (
    <CardSelectionSkeleton
      showSubtotal={false}
      labels={{ subtotal: tc("subtotal"), totalToPay: t("totalToPay"), paymentMethods: t("paymentMethodsLabel") }}
    />
  );
}

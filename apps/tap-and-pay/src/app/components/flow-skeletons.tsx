"use client";

import { CardSelectionSkeleton, PaymentOptionsSkeleton, StepHero as CoreStepHero, TipSkeleton } from "@even/ui";
import { useTranslations } from "next-intl";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";

/**
 * Esqueletos del flujo de pago (opciones → propina → pago). Los cuerpos viven en `@even/ui` y se comparten
 * con FlexBill; aquí solo se les pasan los textos de esta app. Los usan el `FlowNavOverlay` de la transición
 * y las propias vistas mientras cargan: así la tarjeta que sube mide lo mismo que la real.
 */

/** Título del paso con la misma tipografía y márgenes que las vistas reales (el bloque lo pone `FlowCard`). */
export function StepHero({ step }: { step: "payment-options" | "tip-selection" | "card-selection" }) {
  const options = useTranslations("PaymentOptionsPage");
  const tip = useTranslations("TipSelectionPage");
  const pay = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  const { tableNumber } = useTableNavigation();
  if (step === "tip-selection") {
    return <CoreStepHero label={tc("tableLabel", { table: tableNumber ?? "" })} title={tip("subtitle")} />;
  }
  return <CoreStepHero title={step === "payment-options" ? options("subtitle") : pay("selectPaymentMethodTitle")} />;
}

export const PaymentOptionsBody = PaymentOptionsSkeleton;
export const TipBody = TipSkeleton;

export function CardSelectionBody() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  return (
    <CardSelectionSkeleton
      showSubtotal={false}
      labels={{ subtotal: tc("subtotal"), totalToPay: tc("totalToPay"), paymentMethods: t("paymentMethodsLabel") }}
    />
  );
}

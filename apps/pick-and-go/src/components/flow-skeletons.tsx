"use client";

import {
  CardSelectionSkeleton,
  StepHero,
  CartSkeleton,
  FlowHeroBlock,
  FlowTitle,
  OrderConfirmSkeleton,
} from "@even/ui";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FlowStep } from "@/lib/flow-steps";

/**
 * Esqueletos del flujo de compra de Pick & Go: los cuerpos viven en `@even/ui` (los comparten todas las
 * apps de pedido) y aquí solo se les pasan los textos reales de esta app.
 */

/** Título del paso con la misma tipografía y márgenes que la vista real. */
export function useFlowHero(step: FlowStep): { hero: ReactNode; heroClassName?: string } {
  const cart = useTranslations("CartView");
  const confirm = useTranslations("OrderConfirmPage");
  const pay = useTranslations("CardSelectionPage");

  if (step === "cart") {
    return { heroClassName: "p-0", hero: <StepHero label="Pick & Go" title={cart("confirmYourOrder")} /> };
  }
  return { hero: <FlowTitle>{step === "order-confirm" ? confirm("title") : pay("selectPaymentMethodTitle")}</FlowTitle> };
}

/** Título de un paso como bloque completo, para las vistas reales mientras cargan. */
export function FlowHero({ step }: { step: FlowStep }) {
  const { hero, heroClassName } = useFlowHero(step);
  return <FlowHeroBlock className={heroClassName}>{hero}</FlowHeroBlock>;
}

export function OrderConfirmBody() {
  const t = useTranslations("OrderConfirmPage");
  const tc = useTranslations("Common");
  return (
    <OrderConfirmSkeleton
      labels={{ branch: tc("branchLabel"), subtotal: tc("subtotal"), tip: tc("tip"), totalToPay: tc("totalToPay"), continueCta: t("continueCta") }}
    />
  );
}

export function CartBody() {
  const t = useTranslations("CartView");
  return <CartSkeleton labels={{ myCart: t("myCart") }} />;
}

export function CardSelectionBody() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  return (
    <CardSelectionSkeleton labels={{ subtotal: tc("subtotal"), totalToPay: tc("totalToPay"), paymentMethods: t("paymentMethodsLabel") }} />
  );
}

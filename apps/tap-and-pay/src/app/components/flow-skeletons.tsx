"use client";

import { Ghost } from "@even/ui";
import { useTranslations } from "next-intl";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";

/**
 * Esqueletos del flujo de pago (opciones → propina → pago). Los usan el `FlowNavOverlay` de la
 * transición y las propias vistas mientras cargan: así la tarjeta que sube mide lo mismo que la real.
 * Los datos que cambian son `Ghost` (misma fuente, sin texto visible); los títulos y etiquetas son reales.
 */

const TITLE_CLASS =
  "mt-2 mb-6 text-3xl leading-7 font-medium text-white md:mt-3 md:mb-8 md:text-4xl md:leading-9 lg:text-5xl lg:leading-tight";
const TITLE_BOX = "flex flex-col justify-center px-8 py-6 md:px-10 md:py-8 lg:px-12 lg:py-10";

/** Título del paso con la misma tipografía y márgenes que las vistas reales (el bloque lo pone `FlowCard`). */
export function StepHero({ step }: { step: "payment-options" | "tip-selection" | "card-selection" }) {
  const options = useTranslations("PaymentOptionsPage");
  const tip = useTranslations("TipSelectionPage");
  const pay = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  const { tableNumber } = useTableNavigation();
  if (step === "tip-selection") {
    return (
      <div className={TITLE_BOX}>
        <h1 className="text-xl font-medium text-mist md:text-2xl lg:text-3xl">{tc("tableLabel", { table: tableNumber ?? "" })}</h1>
        <h1 className={TITLE_CLASS}>{tip("subtitle")}</h1>
      </div>
    );
  }
  return (
    <div className={TITLE_BOX}>
      <h1 className={TITLE_CLASS}>{step === "payment-options" ? options("subtitle") : pay("selectPaymentMethodTitle")}</h1>
    </div>
  );
}

/** Cuerpo de "opciones de pago": cuatro filas con icono, título y flecha, y el total fijo abajo. */
export function PaymentOptionsBody() {
  return (
    <>
      <div className="flex-1 overflow-y-auto pb-35 md:pb-40 lg:pb-45">
        <div className="mt-4 flex flex-col md:mt-6">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="w-full animate-pulse border-b border-stroke bg-white">
              <div className="flex items-center gap-3 px-4 py-3 md:gap-4 md:px-5 md:py-4 lg:gap-5 lg:px-6 lg:py-5">
                <div className="size-16 rounded-sm bg-tone-200 md:size-20 md:rounded-md lg:size-24" />
                <div className="flex-1">
                  <div className="mb-2 h-5 w-3/4 rounded bg-tone-200" />
                  <div className="h-4 w-1/2 rounded bg-tone-200" />
                </div>
                <div className="size-5 rounded bg-tone-200 md:size-6 lg:size-7" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="fixed fixed-col bottom-0 z-10 bg-white px-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:px-8 lg:px-10">
        <div className="animate-pulse space-y-2 py-4 md:space-y-3 md:py-8 lg:py-12">
          <div className="flex items-center justify-between">
            <div className="h-6 w-32 rounded bg-tone-200" />
            <div className="h-6 w-24 rounded bg-tone-200" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 rounded bg-tone-200" />
            <div className="h-5 w-20 rounded bg-tone-200" />
          </div>
        </div>
      </div>
    </>
  );
}

/** Cuerpo de "propina" (cuenta completa): total, selector de propina y botón. */
export function TipBody() {
  return (
    <div className="animate-pulse space-y-3 px-8 md:space-y-4 md:px-10 lg:space-y-5 lg:px-12">
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-tone-200" />
        <div className="h-4 w-20 rounded bg-tone-200" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-4 w-16 rounded bg-tone-200" />
        <div className="grid flex-1 grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-7 rounded-full bg-tone-200" />
          ))}
        </div>
      </div>
      <div className="border-t border-tone-200 pt-4">
        <div className="flex w-full justify-between gap-3">
          <div className="flex flex-col justify-center">
            <div className="mb-1 h-3 w-20 rounded bg-tone-200" />
            <div className="h-8 w-28 rounded bg-tone-200" />
          </div>
          <div className="h-9 w-28 rounded-full bg-tone-300 md:h-10 lg:h-11" />
        </div>
      </div>
    </div>
  );
}

/** Cuerpo de "pago": resumen, métodos y la barra fija. */
export function CardSelectionBody() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  return (
    <div className="flex-1 py-8 pb-30">
      <div className="mb-6 space-y-2">
        <div className="flex items-center justify-between text-base font-medium text-black md:text-lg lg:text-xl">
          <span>{tc("totalToPay")}</span>
          <Ghost>$000.00 MXN</Ghost>
        </div>
      </div>
      <h3 className="mb-3 font-medium text-black">{t("paymentMethodsLabel")}</h3>
      <div className="space-y-2.5">
        <div className="h-[46px] w-full animate-pulse rounded-full bg-tone-100" />
        <div className="h-[46px] w-full animate-pulse rounded-full bg-tone-100" />
      </div>
      <div className="fixed fixed-col bottom-0 z-10 bg-white px-6 py-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:px-8 lg:px-10">
        <div className="h-12 w-full animate-pulse rounded-full bg-even-grass/40" />
      </div>
    </div>
  );
}

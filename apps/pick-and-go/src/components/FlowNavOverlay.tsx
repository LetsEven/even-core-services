"use client";

import { cn, sheetClasses } from "@even/ui";
import { useTranslations } from "next-intl";
import { usePendingFlowStep, type FlowStep } from "@/lib/route-transition";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";

const RISE = "0.7s cubic-bezier(0.22, 0.8, 0.24, 1)";
const FADE = "0.5s ease";

function Row({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-tone-200 ${className}`} />;
}

function useTitle(step: FlowStep) {
  const cart = useTranslations("CartView");
  const confirm = useTranslations("OrderConfirmPage");
  const pay = useTranslations("CardSelectionPage");
  if (step === "cart") return cart("confirmYourOrder");
  if (step === "order-confirm") return confirm("title");
  return pay("selectPaymentMethodTitle");
}

function Skeleton({ step }: { step: FlowStep }) {
  const title = useTitle(step);
  // La confirmación real es una tarjeta del alto de su contenido, anclada abajo.
  const anchored = step === "order-confirm";
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-even-evergreen" aria-hidden>
      {/* Fondo verde opaco: oculta la vista real que ya se montó debajo mientras sube la tarjeta */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div>
          <MenuHeaderBack onBack={() => {}} />
        </div>
        <div className={cn("flex w-full flex-1 flex-col", anchored && "justify-end")}>
          <div className={`${sheetClasses.hero} px-8 py-6 md:px-10 md:py-8 lg:px-12 lg:py-10`} style={{ animation: `fade-in ${FADE} 0.2s backwards` }}>
            <h1 className="mt-2 mb-6 text-3xl leading-7 font-medium text-white md:text-4xl">{title}</h1>
          </div>
          <div className={cn(sheetClasses.card, "pt-8", anchored && "flex-none")} style={{ animation: `slideUp ${RISE}` }}>
            <div className="flex flex-col gap-4">
              <div className="flex justify-between">
                <Row className="h-4 w-20" />
                <Row className="h-4 w-24" />
              </div>
              <div className="flex justify-between">
                <Row className="h-4 w-28" />
                <Row className="h-4 w-20" />
              </div>
              <div className="h-px bg-tone-200" />
              <Row className="h-12 w-full" />
              <Row className="h-12 w-full" />
              <Row className="h-12 w-full" />
            </div>
            <div className="mt-auto pt-6 pb-8">
              <Row className="h-14 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Esqueleto del paso destino, visible desde que se pide navegar hasta que la ruta real se monta. */
export default function FlowNavOverlay() {
  const step = usePendingFlowStep();
  if (!step) return null;
  return <Skeleton step={step} />;
}

"use client";

import { cn, sheetClasses } from "@even/ui";
import { usePendingFlowStep, type FlowStep } from "@/lib/route-transition";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { CardSelectionBody, CartBody, FlowHero, OrderConfirmBody } from "@/components/flow-skeletons";

const RISE = "0.7s cubic-bezier(0.22, 0.8, 0.24, 1)";
const FADE = "0.5s ease";

const BODIES: Record<FlowStep, () => React.JSX.Element> = {
  cart: CartBody,
  "order-confirm": OrderConfirmBody,
  "card-selection": CardSelectionBody,
};

// Mismo relleno de la tarjeta que la vista real de cada paso.
const CARD_CLASS: Record<FlowStep, string> = {
  cart: "overflow-hidden",
  "order-confirm": "flex-none py-8",
  "card-selection": "overflow-hidden",
};

function Skeleton({ step }: { step: FlowStep }) {
  const Body = BODIES[step];
  // La confirmación real es una tarjeta del alto de su contenido, anclada abajo.
  const anchored = step === "order-confirm";
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-even-evergreen" aria-hidden>
      {/* Fondo verde opaco: oculta la vista real que ya se montó debajo mientras sube la tarjeta */}
      <div className="app-col relative flex min-h-0 flex-1 flex-col">
        <div>
          <MenuHeaderBack onBack={() => {}} />
        </div>
        <div className={cn("flex w-full flex-1 flex-col", anchored && "justify-end")}>
          <div style={{ animation: `fade-in ${FADE} 0.2s backwards` }}>
            <FlowHero step={step} />
          </div>
          <div className={cn(sheetClasses.card, CARD_CLASS[step])} style={{ animation: `slideUp ${RISE}` }}>
            <Body />
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

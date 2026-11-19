"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { useFlowAmountValue } from "../lib/flow-amount";
import { Ghost } from "./flow-nav-overlay";

/**
 * Bloque superior del flujo de pago ("Monto protagonista"): anclado arriba, con la misma posición en todas las vistas
 * (el padding lo pone `sheetClasses.hero`). La línea de contexto va siempre en el mismo lugar; debajo, o el monto vivo
 * (`AmountHero`) o un título grande (`TitleHero`) para las vistas sin monto.
 */

// Reserva dos líneas: el contexto y el título de la vista pueden envolver y el monto no debe cambiar de posición.
const CONTEXT =
  "line-clamp-2 min-h-12 text-lg leading-6 text-mint md:min-h-14 md:text-xl md:leading-7 lg:min-h-16 lg:text-2xl lg:leading-8";

/** Línea de contexto: "Mesa 1 · Revisa tu cuenta". */
function ContextLine({ context, title, className }: { context?: ReactNode; title?: ReactNode; className?: string }) {
  const hasContext = context != null && context !== "";
  return (
    <p className={cn(CONTEXT, className)}>
      {hasContext && context}
      {hasContext && title != null && <span aria-hidden> · </span>}
      {title}
    </p>
  );
}

/** Animación corta al aparecer el valor (de esqueleto a dato, o al cambiar de vista). */
const FADE_IN = "animate-[flow-hero-in_0.3s_ease-out]";

/**
 * Monto protagonista. Lee el monto vivo que publica la vista (`useFlowAmount`): mientras no hay (esqueleto de la
 * transición, carga) pinta `Ghost` con las mismas medidas, así el bloque no cambia de alto al llegar el dato.
 */
export function AmountHero({
  context,
  title,
  label,
  contextClassName,
}: {
  context?: ReactNode;
  title: ReactNode;
  /** "Total a pagar". */
  label: ReactNode;
  contextClassName?: string;
}) {
  const amount = useFlowAmountValue();
  return (
    <div data-flow-hero="amount">
      <style>{`@keyframes flow-hero-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <ContextLine context={context} title={title} className={contextClassName} />
      <p className="mt-3 text-base leading-6 text-white md:text-lg md:leading-7 lg:text-xl lg:leading-8">
        {amount?.label ?? label}
      </p>
      <p
        className="mt-1 text-[64px] leading-none font-medium text-even-grass tabular-nums md:text-[72px] lg:text-[80px]"
        data-testid="flow-hero-total"
      >
        {amount ? (
          <span className={FADE_IN}>{amount.total}</span>
        ) : (
          <Ghost className="inline-block align-top">$000.00</Ghost>
        )}
      </p>
      <p className="mt-3 min-h-6 text-base leading-6 text-mint md:min-h-7 md:text-lg md:leading-7 lg:min-h-8 lg:text-xl lg:leading-8">
        {amount ? (
          amount.breakdown && <span className={FADE_IN}>{amount.breakdown}</span>
        ) : (
          <Ghost>Cuenta $000.00 + propina $00.00</Ghost>
        )}
      </p>
    </div>
  );
}

/** Hero de las vistas sin monto: la misma línea de contexto arriba y un título grande en la posición fija. */
export function TitleHero({
  context,
  title,
  subtitle,
  contextClassName,
}: {
  context?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  contextClassName?: string;
}) {
  return (
    <div data-flow-hero="title">
      {context != null && context !== "" && <ContextLine context={context} className={contextClassName} />}
      {title != null && (
        <p className="mt-3 text-[32px] leading-10 font-medium text-white md:text-[40px] md:leading-12 lg:text-5xl lg:leading-14">
          {title}
        </p>
      )}
      {subtitle != null && (
        <p className="mt-2 text-base leading-6 text-mint md:text-lg md:leading-7 lg:text-xl lg:leading-8">{subtitle}</p>
      )}
    </div>
  );
}

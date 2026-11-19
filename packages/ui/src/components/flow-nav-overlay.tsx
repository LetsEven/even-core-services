"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePendingFlowTarget } from "../lib/route-transition";
import { FlowCard, type FlowCardLayout } from "./flow-card";

export type FlowScreen = {
  /** Título del paso (mismo que la vista real). */
  hero: ReactNode;
  /** Clases extra del bloque del título (p. ej. `p-0` si el título trae su propio relleno). */
  heroClassName?: string;
  /** Esqueleto de la tarjeta: el mismo componente de la vista real pintado en modo carga. */
  body: ReactNode;
  /** Relleno de la tarjeta; por defecto `overflow-hidden` (`fill`) o `flex-none py-8` (`anchored`). */
  cardClassName?: string;
  /** `fill` (por defecto) o `anchored`: la vista real mide lo que su contenido y queda pegada abajo. */
  layout?: FlowCardLayout;
  /** Clases del contenedor de la hoja (margen lateral, etc.). */
  frameClassName?: string;
  /** @deprecated usa `layout: "anchored"`. */
  anchored?: boolean;
};

/** Destino de la transición: paso, ruta completa y su query (p. ej. `type=equal-shares`). */
export type FlowScreenContext = { step: string; path: string; params: URLSearchParams };

/** Pantalla fija, o función cuando la forma del paso depende de la query del destino. */
export type FlowScreenSource = FlowScreen | ((context: FlowScreenContext) => FlowScreen);

export type FlowNavOverlayProps = {
  /** Pantalla de cada paso del flujo, por segmento de ruta. */
  screens: Record<string, FlowScreenSource>;
  /** Cabecera con el botón de volver (solo visual). */
  header: ReactNode;
};

const RISE = "0.7s cubic-bezier(0.22, 0.8, 0.24, 1)";
const FADE = "0.5s ease";

/** Dato que aún no llega: ocupa lo mismo que el texto real, pero se ve como barra. */
export function Ghost({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span aria-hidden className={cn("animate-pulse rounded-full bg-tone-200 text-transparent select-none", className)}>
      {children}
    </span>
  );
}

/**
 * Esqueleto del paso destino, visible desde que se pide navegar hasta que la ruta real se monta.
 * Va en el layout de la ruta, junto con `RouteTransitionGate` en el layout raíz.
 */
export function FlowNavOverlay({ screens, header }: FlowNavOverlayProps) {
  const target = usePendingFlowTarget();
  const source = target ? screens[target.step] : undefined;
  if (!target || !source) return null;
  const screen =
    typeof source === "function"
      ? source({ step: target.step, path: target.path, params: new URLSearchParams(target.path.split("?")[1] ?? "") })
      : source;
  return (
    <div
      className="fixed inset-0 z-1000 flex flex-col overflow-hidden bg-even-evergreen"
      aria-hidden
      data-flow-overlay={target.step}
    >
      <style>{`
        @keyframes flow-rise { from { transform: translateY(100%); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } }
        @keyframes flow-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      {/* Fondo verde opaco: oculta la vista real que ya se montó debajo mientras sube la tarjeta */}
      <div className="app-col relative flex min-h-0 flex-1 flex-col">
        <div>{header}</div>
        <FlowCard
          className={screen.frameClassName}
          layout={screen.layout ?? (screen.anchored ? "anchored" : "fill")}
          hero={screen.hero}
          heroClassName={screen.heroClassName}
          heroStyle={{ animation: `flow-fade ${FADE} 0.2s backwards` }}
          cardClassName={screen.cardClassName}
          cardStyle={{ animation: `flow-rise ${RISE}` }}
        >
          {screen.body}
        </FlowCard>
      </div>
    </div>
  );
}

/** Título del paso con la misma tipografía y márgenes que la vista real. */
export function FlowTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col justify-center px-8 py-6">
      <p className="mt-2 mb-6 text-3xl leading-7 font-medium text-white">{children}</p>
    </div>
  );
}

/** Cuerpo genérico de la tarjeta: filas de relleno y botón inferior. Para pasos sin esqueleto propio. */
export function FlowSkeletonBody({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex-1 px-6 py-8 pb-[120px] md:px-8 lg:px-10">
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center justify-between gap-4">
            <Ghost className="w-1/2">Concepto del paso</Ghost>
            <Ghost>$000.00 MXN</Ghost>
          </div>
        ))}
      </div>
      <div className="fixed fixed-col bottom-0 z-10 bg-white px-6 py-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:px-8 lg:px-10">
        <div className="h-12 w-full animate-pulse rounded-full bg-even-grass/40" />
      </div>
    </div>
  );
}

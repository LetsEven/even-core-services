"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { sheetClasses } from "./sheet-screen";

export type FlowCardLayout = "fill" | "anchored";

export type FlowCardProps = {
  /** Bloque superior del paso (contexto + monto o título), anclado arriba. */
  hero?: ReactNode;
  /** Clases extra del bloque del título (p. ej. `p-0` si el título trae su propio relleno). */
  heroClassName?: string;
  heroStyle?: CSSProperties;
  /**
   * `fill`: la tarjeta llena la altura restante de la pantalla.
   * `anchored`: la tarjeta mide lo que su contenido y queda pegada al borde inferior.
   */
  layout?: FlowCardLayout;
  /** Relleno y overflow de la tarjeta; por defecto `overflow-hidden` en `fill` y `flex-none py-8` en `anchored`. */
  cardClassName?: string;
  cardStyle?: CSSProperties;
  /**
   * Anima los cambios de altura del contenido (solo útil en `anchored`): si el contenido real termina
   * midiendo distinto al esqueleto, la tarjeta crece o se encoge en vez de saltar.
   */
  animateHeight?: boolean;
  /** Duración (ms) de la animación de altura. */
  heightMs?: number;
  /** Clases del contenedor (p. ej. margen lateral cuando la vista real mete la hoja dentro de un `px-4`). */
  className?: string;
  children: ReactNode;
};

/**
 * Hoja de un paso del flujo de compra: título + tarjeta. La comparten la vista real y el esqueleto de
 * la transición (`FlowNavOverlay`), así ambos miden lo mismo y la tarjeta no cambia de altura al cargar.
 */
export function FlowCard({
  hero,
  heroClassName,
  heroStyle,
  layout = "fill",
  cardClassName,
  cardStyle,
  animateHeight,
  heightMs = 350,
  className,
  children,
}: FlowCardProps) {
  const anchored = layout === "anchored";
  return (
    <div className={cn("flex w-full flex-1 flex-col", className)}>
      {hero != null && (
        <div style={heroStyle} className="flex-none">
          <div className={cn(sheetClasses.hero, heroClassName)}>{hero}</div>
        </div>
      )}
      {/* Espacio flexible: el hero queda arriba y la tarjeta abajo. */}
      {anchored && <div aria-hidden className="min-h-2 flex-1" />}
      <div
        className={cn(sheetClasses.card, cardClassName ?? (anchored ? "flex-none py-8" : "overflow-hidden"))}
        style={cardStyle}
      >
        {animateHeight ? <AutoHeight ms={heightMs}>{children}</AutoHeight> : children}
      </div>
    </div>
  );
}

/** Envuelve el contenido y anima su altura cuando cambia (ResizeObserver). La primera medida no anima. */
function AutoHeight({ ms, children }: { ms: number; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [animated, setAnimated] = useState(false);

  useLayoutEffect(() => {
    const node = inner.current;
    if (!node) return;
    setHeight(node.offsetHeight);
    // Se activa la transición después de la primera medida para que no anime el montaje.
    const frame = requestAnimationFrame(() => setAnimated(true));
    if (typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(frame);
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      style={{
        height: height ?? "auto",
        overflow: "hidden",
        transition: animated ? `height ${ms}ms cubic-bezier(0.22, 0.8, 0.24, 1)` : undefined,
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}

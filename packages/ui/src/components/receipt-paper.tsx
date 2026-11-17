"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "../lib/cn";
import { SPRING } from "./menu/motion-provider";

/** Borde inferior dentado (como papel arrancado de la impresora térmica). */
const TOOTH = 14;
const ZIGZAG: CSSProperties = {
  WebkitMask: `linear-gradient(#000 0 0) top / 100% calc(100% - ${TOOTH / 2}px) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / ${TOOTH}px 100%`,
  mask: `linear-gradient(#000 0 0) top / 100% calc(100% - ${TOOTH / 2}px) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / ${TOOTH}px 100%`,
};

/** Avance de la impresora: el papel sale a tirones, con pausas entre cada tramo. */
const PRINT_Y = ["-100%", "-78%", "-78%", "-52%", "-52%", "-26%", "-26%", "-8%", "-8%", "0%"];
const PRINT_TIMES = [0, 0.14, 0.2, 0.38, 0.44, 0.62, 0.68, 0.86, 0.9, 1];

/** Duración por defecto de la impresión (ms). */
export const RECEIPT_PRINT_MS = 2600;

export interface ReceiptPaperProps {
  /**
   * `appear`: aparece rápido (cuenta abierta, se consulta seguido).
   * `print`: sale de la ranura de una impresora, pausado (confirmación de pago).
   * `static`: el mismo papel, sin animación de entrada (para vistas expandidas).
   */
  mode?: "appear" | "print" | "static";
  /** Duración del tramo de impresión, en ms (solo `print`). */
  printMs?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Hoja de papel tipo ticket: tipografía monoespaciada, borde dentado y sombra.
 * Compartida por FlexBill (cuenta y pago completado) y lista para Tap & Pay.
 * Requiere `MotionProvider` arriba (la app ya lo monta en el layout del flujo).
 */
export function ReceiptPaper({ mode = "appear", printMs = RECEIPT_PRINT_MS, className, children }: ReceiptPaperProps) {
  const paper = (
    <div className="drop-shadow-[0_10px_18px_rgba(0,0,0,0.28)]">
      <div
        className={cn("relative bg-even-offwhite text-even-ink px-5 pt-5 font-mono", className)}
        style={{ ...ZIGZAG, paddingBottom: TOOTH + 16 }}
      >
        {children}
      </div>
    </div>
  );

  if (mode === "print") {
    return (
      <div className="relative w-full">
        {/* Ranura de la impresora */}
        <div className="relative z-10 mx-auto h-3 w-[96%] rounded-full bg-black/70 shadow-[inset_0_2px_3px_rgba(0,0,0,0.6)]" />
        {/* El ticket entero (con su contenido) sale de la ranura y baja a tirones; el hueco ya está reservado */}
        <div className="-mt-1.5 overflow-hidden px-3 pb-4">
          <m.div
            initial={{ y: PRINT_Y[0] }}
            animate={{ y: PRINT_Y }}
            transition={{ duration: printMs / 1000, times: PRINT_TIMES, ease: "easeInOut" }}
          >
            {paper}
          </m.div>
        </div>
      </div>
    );
  }

  if (mode === "static") {
    return <div className="w-full px-3 pb-4">{paper}</div>;
  }

  return (
    <m.div
      className="w-full px-3 pb-4"
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING, opacity: { duration: 0.18 } }}
    >
      {paper}
    </m.div>
  );
}

/**
 * Sello que cae sobre el ticket. Colócalo dentro de un contenedor `relative`
 * (se centra sobre él). Con `animated` espera a que termine la impresión.
 */
export function ReceiptStamp({
  label,
  animated = true,
  delay = RECEIPT_PRINT_MS / 1000 + 0.15,
  onDone,
}: {
  label: string;
  animated?: boolean;
  /** Segundos de espera antes de estampar (por defecto, al terminar de imprimir). */
  delay?: number;
  onDone?: () => void;
}) {
  useEffect(() => {
    if (!animated) return;
    const t = window.setTimeout(
      () => {
        try {
          navigator.vibrate?.(14);
        } catch {
          /* sin vibración */
        }
        onDone?.();
      },
      (delay + 0.12) * 1000,
    );
    return () => window.clearTimeout(t);
  }, [animated, delay, onDone]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
      <m.div
        className="rounded-md border-4 border-even-shamrock px-3 py-0.5 text-xl font-black tracking-[0.2em] text-even-shamrock uppercase mix-blend-multiply"
        initial={animated ? { opacity: 0, scale: 2.6, rotate: -22 } : false}
        animate={{ opacity: 0.88, scale: 1, rotate: -12 }}
        transition={{ delay, type: "spring", stiffness: 520, damping: 26, mass: 0.8 }}
      >
        {label}
      </m.div>
    </div>
  );
}

/** Línea punteada divisoria del ticket. */
export function ReceiptRule({ className }: { className?: string }) {
  return <div role="separator" className={cn("my-3 border-t-2 border-dashed border-even-ink/25", className)} />;
}

/** Renglón del ticket: concepto a la izquierda, importe a la derecha. */
export function ReceiptRow({
  left,
  right,
  sub,
  strong,
  className,
}: {
  left: ReactNode;
  right?: ReactNode;
  sub?: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 py-1.5", strong && "font-bold", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-snug">{left}</div>
        {sub ? <div className="mt-0.5 text-xs text-even-ink/55">{sub}</div> : null}
      </div>
      {right != null ? <div className="shrink-0 text-sm tabular-nums">{right}</div> : null}
    </div>
  );
}

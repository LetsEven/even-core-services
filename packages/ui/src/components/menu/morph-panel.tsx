"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { cn } from "../../lib/cn";
import { MotionProvider, SPRING } from "./motion-provider";

export type MorphPanelProps = {
  open: boolean;
  onClose: () => void;
  /** Mismo `layoutId` que el botón de origen (`DockItem.morphId`). */
  layoutId: string;
  /** Nombre accesible del diálogo. */
  label: string;
  /** Clases del panel (ancho, fondo). El radio va en `radius`. */
  className?: string;
  /** Radio en px; debe ir aquí (no en clases) para que el morph lo interpole sin deformarlo. */
  radius?: number;
  children: ReactNode;
};

/**
 * El botón se transforma en este panel (y regresa al cerrar), al estilo Dynamic Island: el contenedor
 * anima posición, tamaño y radio con `layoutId`; el contenido entra con un fundido para no deformarse.
 * Pensado para cualquier botón → detalle, no solo el pedido en curso.
 */
export function MorphPanel({ open, onClose, layoutId, label, className, radius = 32, children }: MorphPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <MotionProvider>
      <AnimatePresence>
        {open && (
          <>
            <m.div
              key="backdrop"
              data-testid="morph-panel-backdrop"
              className="fixed inset-0 z-[998] bg-black/25 backdrop-blur-xs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={onClose}
            />
            <div key="stage" className="pointer-events-none fixed inset-0 z-[999] flex items-center justify-center">
              <m.div
                layoutId={layoutId}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                className={cn("pointer-events-auto relative flex max-h-[85vh] w-full flex-col overflow-hidden", className)}
                style={{ borderRadius: radius }}
                transition={SPRING}
                onClick={(event) => event.stopPropagation()}
              >
                <m.div
                  className="flex min-h-0 flex-1 flex-col"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.2 } }}
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                >
                  {children}
                </m.div>
              </m.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </MotionProvider>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { Menu, ShoppingBag, ShoppingCart, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { playMorphClose, playMorphOpen, prefersReducedMotion } from "../../lib/button-morph";

export type MenuFabProps = {
  open: boolean;
  onToggle: () => void;
  /** Artículos en el carrito. Con más de 0 el botón se pone verde y cambia al ícono del carrito. */
  count?: number;
  /** Oculto mientras hay otra capa encima (bienvenida, detalle, modales). */
  hidden?: boolean;
  /** Texto del contador para lectores de pantalla: "3 artículos". Se agrega al nombre del botón. */
  countLabel?: (count: number) => string;
  labels: { open: string; close: string };
};

/**
 * Botón flotante abajo a la derecha que abre las acciones del menú (perfil, carrito, Pepper).
 * Es interactivo: con el carrito vacío es la hamburguesa; con artículos se vuelve verde y muestra el carrito.
 * Conserva `#cart-icon` y `#cart-badge` porque `useFlyToCart` (@even/cart) anima el platillo hasta ellos.
 */
export function MenuFab({ open, onToggle, count = 0, hidden = false, countLabel, labels }: MenuFabProps) {
  const hasItems = count > 0;
  const base = open ? labels.close : labels.open;
  const label = hasItems && countLabel ? `${base}, ${countLabel(count)}` : base;

  return (
    <div
      id="cart-icon"
      className={cn(
        "fixed fixed-fab-end z-[60] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        hidden && "pointer-events-none translate-y-4 opacity-0",
      )}
      style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      inert={hidden}
      aria-hidden={hidden}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={label}
        // before: área táctil de 64 px sobre un botón de 56 px.
        className={cn(
          "relative flex size-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 before:absolute before:-inset-1 active:scale-90 md:size-16",
          hasItems
            ? "bg-even-grass text-even-evergreen"
            : "border border-white/40 bg-white/85 text-primary backdrop-blur-sm",
        )}
      >
        <FabIcon>
          {open ? <X className="size-6 md:size-7" /> : hasItems ? <ShoppingCart className="size-6 md:size-7" /> : <Menu className="size-6 md:size-7" />}
        </FabIcon>
      </button>
      {hasItems && (
        <div
          id="cart-badge"
          key={count}
          className="pointer-events-none absolute -top-1 -left-1 flex size-6 animate-qty-pop items-center justify-center rounded-full bg-even-evergreen text-xs font-medium text-white md:size-7 md:text-sm"
        >
          {count}
        </div>
      )}
    </div>
  );
}

const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

/** Anillo que rodea al botón; se llena con el avance del pedido. */
export function ProgressRing({ value, label }: { value: number; label?: string }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <svg
      viewBox="0 0 100 100"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className="pointer-events-none absolute inset-[3px] size-[calc(100%-6px)] -rotate-90"
    >
      <circle cx="50" cy="50" r={RING_R} fill="none" strokeWidth="6" className="stroke-white/20" />
      <circle
        cx="50"
        cy="50"
        r={RING_R}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        className="stroke-even-grass transition-[stroke-dashoffset] duration-700 ease-out"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - v)}
      />
    </svg>
  );
}

export type OrderFabProps = {
  /** Avance del pedido activo (0 a 1). */
  progress: number;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  hidden?: boolean;
  /** "Ver pedido en curso". */
  label: string;
  /** Texto del progreso para lectores de pantalla. */
  progressLabel?: string;
};

/**
 * Botón flotante del pedido activo, justo encima del botón del menú. Muestra el avance del pedido
 * como un aro dentro del botón y abre directo el detalle de ese pedido.
 */
export function OrderFab({ progress, onClick, hidden = false, label, progressLabel }: OrderFabProps) {
  return (
    <div
      className={cn(
        "fixed fixed-fab-end z-[60] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        hidden && "pointer-events-none translate-y-4 opacity-0",
      )}
      style={{ bottom: "calc(max(1.25rem, env(safe-area-inset-bottom)) + 4.25rem)" }}
      inert={hidden}
      aria-hidden={hidden}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="relative flex size-12 items-center justify-center rounded-full bg-even-evergreen text-white shadow-lg before:absolute before:-inset-1 active:scale-90 md:size-14"
      >
        <ProgressRing value={progress} label={progressLabel} />
        <ShoppingBag className="size-5 md:size-6" />
      </button>
    </div>
  );
}

function FabIcon({ children }: { children: ReactNode }) {
  return <span className="flex items-center justify-center">{children}</span>;
}

export type MenuActionsModalProps = {
  open: boolean;
  onClose: () => void;
  /** Nombre accesible del diálogo ("Menú"). */
  label: string;
  children: ReactNode;
};

/**
 * Fondo desenfocado a pantalla completa con la píldora de acciones hacia el centro (un poco abajo).
 * Se cierra con Escape, tocando fuera de la píldora o con el mismo botón flotante.
 * Los hijos son `PillButton`, `PillCartButton` y `PillPepperButton`.
 */
export function MenuActionsModal({ open, onClose, label, children }: MenuActionsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  // La píldora nace del botón flotante (#cart-icon): el botón viaja al centro y ahí se expande
  // hasta la forma de la píldora; al cerrar vuelve a encogerse y regresa a su lugar.
  useLayoutEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    const dialog = dialogRef.current;
    const fab = document.getElementById("cart-icon");
    if (!dialog || !fab || prefersReducedMotion()) return;
    const origin = fab.getBoundingClientRect();
    if (open) {
      playMorphOpen(dialog, origin, { fullRadius: "9999px" });
    } else {
      // React ya la dejó con opacity 0: se mantiene visible hasta que termine el viaje de regreso.
      dialog.style.opacity = "1";
      playMorphClose(
        dialog,
        origin,
        () => {
          dialog.style.opacity = "0";
        },
        { fullRadius: "9999px" },
      );
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Dos capas hermanas (no anidadas): el fondo con blur y el diálogo. Un
  // backdrop-filter dentro de otro hace que iOS Safari pinte el fondo corrupto.
  return (
    <>
      <div
        data-testid="menu-actions-backdrop"
        className="reduce-motion-fade fixed inset-0 z-[55] bg-black/30 backdrop-blur-md transition-opacity duration-200"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        inert={!open}
        aria-hidden={!open}
        onClick={onClose}
      />
      <div
        className="pointer-events-none fixed inset-0 z-[56] flex items-center justify-center"
        inert={!open}
        aria-hidden={!open}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="pointer-events-auto flex items-center gap-4 rounded-full border border-white/40 px-6 py-3 shadow-lg md:gap-5 md:px-7 md:py-3.5"
          style={{
            background: "rgba(255, 255, 255, 0.82)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            transform: "translateY(12vh)",
            opacity: open ? 1 : 0,
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

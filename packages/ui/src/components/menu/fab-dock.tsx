"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { Menu, ShoppingCart, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { MotionProvider, SPRING } from "./motion-provider";
import { ProgressRing } from "./menu-fab";

export type DockItem = {
  id: string;
  /** Nombre accesible. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Siempre visible, aunque el menú esté cerrado (pedido en curso, Pepper...). */
  pinned?: boolean;
  /** Contador sobre el botón (carrito, pedidos). */
  count?: number;
  countLabel?: (count: number) => string;
  /** Avance 0 a 1: pinta un anillo alrededor del icono. */
  progress?: number | null;
  progressLabel?: string;
  /** Recorta el contenido al círculo (foto de perfil). */
  clip?: boolean;
  /** Ficha que sale al lado ("Hola, ¿necesitas algo?"). Mientras haya contenido se muestra. */
  bubble?: ReactNode;
  /**
   * `layoutId` compartido con un `MorphPanel`: el botón se transforma en el panel y regresa a su lugar.
   * Mientras el panel esté abierto, pasa `expanded` para que el botón deje su lugar al panel.
   */
  morphId?: string;
  expanded?: boolean;
  /** Oculta solo este elemento (por ejemplo, sin pedido activo). */
  hidden?: boolean;
};

export type FabDockProps = {
  open: boolean;
  onToggle: () => void;
  /** Cierra el menú con Escape. No hay fondo: la página sigue usable con el menú abierto. */
  onClose: () => void;
  items: DockItem[];
  /** Artículos en el carrito. Con más de 0 el botón principal se pone verde y muestra el carrito. */
  count?: number;
  countLabel?: (count: number) => string;
  /** Oculto mientras hay otra capa encima (bienvenida, detalle, modales). */
  hidden?: boolean;
  /** Nombre accesible del grupo de acciones ("Menú"). */
  menuLabel: string;
  labels: { open: string; close: string };
};

const GLASS: React.CSSProperties = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.78), rgba(255,255,255,0.58))",
  backdropFilter: "blur(24px) saturate(1.6)",
  WebkitBackdropFilter: "blur(24px) saturate(1.6)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(255,255,255,0.25), 0 10px 30px rgba(0,0,0,0.18)",
};

/**
 * Menú flotante abajo a la derecha: el botón principal despliega hacia arriba una columna de vidrio con
 * las acciones. Los elementos `pinned` quedan siempre visibles junto al botón principal.
 * Conserva `#cart-icon` y `#cart-badge` porque `useFlyToCart` (@even/cart) anima el platillo hasta ellos.
 *
 * El vidrio es `backdrop-filter` (no `liquid-glass-react`, que no se ve en Safari iOS) y la cápsula nunca
 * recibe transform: crece animando `height`, para que Safari no pinte el desenfoque corrupto.
 */
export function FabDock({ open, onToggle, onClose, items, count = 0, countLabel, hidden = false, menuLabel, labels }: FabDockProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const visible = items.filter((item) => !item.hidden);
  const pinned = visible.filter((item) => item.pinned);
  const folded = visible.filter((item) => !item.pinned);
  const hasItems = count > 0;
  const base = open ? labels.close : labels.open;
  const mainLabel = hasItems && countLabel ? `${base}, ${countLabel(count)}` : base;

  return (
    <MotionProvider>
      <m.div
        className="fixed right-5 z-[60] flex flex-col items-center gap-3 md:right-8"
        style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        initial={false}
        animate={hidden ? { opacity: 0, y: 16 } : { opacity: 1, y: 0 }}
        transition={SPRING}
        inert={hidden}
        aria-hidden={hidden}
      >
        {(folded.length > 0 || pinned.length > 0) && (
          <div
            role="group"
            aria-label={menuLabel}
            className="flex flex-col items-center rounded-full border border-white/50"
            style={GLASS}
          >
            <m.div
              initial={false}
              animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
              transition={SPRING}
              className="overflow-hidden"
              inert={!open}
            >
              <ul className="flex flex-col items-center gap-2 px-1.5 pt-1.5 md:px-2 md:pt-2">
                {folded.map((item, index) => (
                  <m.li
                    key={item.id}
                    initial={false}
                    animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.5 }}
                    // El más cercano al botón principal sale primero: la columna "brota" de él.
                    transition={{ ...SPRING, delay: open ? (folded.length - 1 - index) * 0.045 : 0 }}
                  >
                    <DockButton item={item} />
                  </m.li>
                ))}
              </ul>
            </m.div>
            {pinned.length > 0 && (
              <ul className="flex flex-col items-center gap-2 p-1.5 md:p-2">
                {pinned.map((item) => (
                  <li key={item.id} className="relative">
                    <DockButton item={item} />
                    <AnimatePresence>
                      {item.bubble && !item.expanded && (
                        <m.div
                          key="bubble"
                          role="status"
                          className="absolute top-1/2 right-full mr-3 rounded-2xl rounded-br-sm border border-white/50 px-3 py-2 text-sm whitespace-nowrap text-primary shadow-lg"
                          style={{ ...GLASS, y: "-50%", transformOrigin: "right center" }}
                          initial={{ opacity: 0, scale: 0.6, x: 16 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.8, x: 8 }}
                          transition={SPRING}
                        >
                          {item.bubble}
                        </m.div>
                      )}
                    </AnimatePresence>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div id="cart-icon" className="relative">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={mainLabel}
            // before: área táctil de 64 px sobre un botón de 56 px.
            className={cn(
              "relative flex size-14 items-center justify-center rounded-full shadow-lg transition-[background-color,transform] duration-300 before:absolute before:-inset-1 active:scale-90 md:size-16",
              hasItems && !open
                ? "bg-even-grass text-even-evergreen"
                : "border border-white/40 bg-white/85 text-primary backdrop-blur-sm",
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={open ? "close" : hasItems ? "cart" : "menu"}
                className="flex items-center justify-center"
                initial={{ opacity: 0, rotate: -60, scale: 0.5 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 60, scale: 0.5 }}
                transition={{ duration: 0.18 }}
              >
                {open ? (
                  <X className="size-6 md:size-7" />
                ) : hasItems ? (
                  <ShoppingCart className="size-6 md:size-7" />
                ) : (
                  <Menu className="size-6 md:size-7" />
                )}
              </m.span>
            </AnimatePresence>
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
      </m.div>
    </MotionProvider>
  );
}

function DockButton({ item }: { item: DockItem }) {
  const count = item.count ?? 0;
  const label = count > 0 && item.countLabel ? `${item.label}, ${item.countLabel(count)}` : item.label;
  const hasProgress = item.progress != null;
  const content = (
    <>
      {hasProgress && <ProgressRing value={item.progress ?? 0} label={item.progressLabel} />}
      {item.icon}
    </>
  );
  const className = cn(
    "relative flex size-11 items-center justify-center rounded-full transition-colors active:scale-95 md:size-12",
    hasProgress ? "bg-even-evergreen text-white" : "bg-white/60 text-warm-700 hover:bg-white",
    item.clip && "overflow-hidden",
  );

  return (
    <div className="relative">
      {item.expanded ? (
        // Lugar reservado: el panel ocupa el botón mientras está abierto.
        <div className="size-11 md:size-12" aria-hidden />
      ) : item.morphId ? (
        <m.button
          type="button"
          layoutId={item.morphId}
          layout="position"
          onClick={item.onClick}
          aria-label={label}
          className={className}
          style={{ borderRadius: 24 }}
          transition={SPRING}
        >
          {content}
        </m.button>
      ) : (
        <button type="button" onClick={item.onClick} aria-label={label} className={className}>
          {content}
        </button>
      )}
      {count > 0 && !item.expanded && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-even-grass text-xs font-normal text-even-evergreen"
        >
          {count}
        </div>
      )}
    </div>
  );
}

"use client";

import { Trash2 } from "lucide-react";

type DishBottomBarProps = {
  /** Mientras carga, los botones se quedan y solo su contenido es skeleton. */
  loading?: boolean;
  quantity?: number;
  /** Con cantidad 1 en modo edición el "−" es el bote de basura. */
  minusIsTrash?: boolean;
  onMinus?: () => void;
  onPlus?: () => void;
  onSubmit?: () => void;
  disabled?: boolean;
  /** Botón principal apagado (agotado o formulario incompleto). */
  muted?: boolean;
  label?: string;
};

const stepButton =
  "w-12 h-12 md:w-14 md:h-14 flex items-center justify-center text-black text-xl font-light active:scale-90 transition-transform";

/**
 * Barra inferior del detalle: "−  cantidad  +" y el botón principal con su precio.
 * Es la misma en el esqueleto y en la página real, así los botones nunca aparecen
 * ni desaparecen: solo cambia su contenido. Va por encima de la foto en vuelo (z-90).
 */
export default function DishBottomBar({
  loading = false,
  quantity = 1,
  minusIsTrash = false,
  onMinus,
  onPlus,
  onSubmit,
  disabled = false,
  muted = false,
  label,
}: DishBottomBarProps) {
  const off = muted || disabled;
  return (
    <div
      className="fixed fixed-col bottom-0 z-90 flex items-center gap-3 px-4 md:px-6 lg:px-8 pt-4 md:pt-5"
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        background: "rgba(255, 255, 255, 0.75)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="flex items-center bg-white border border-tone-300 rounded-2xl shadow-sm shrink-0">
        <button type="button" onClick={onMinus} disabled={loading} className={stepButton}>
          {minusIsTrash ? <Trash2 className="size-5 md:size-6 text-danger-500" /> : "−"}
        </button>
        <span className="w-8 text-center text-base md:text-lg font-medium text-black select-none">
          {loading ? <span className="mx-auto block h-5 w-4 animate-pulse rounded bg-tone-200" /> : quantity}
        </span>
        <button type="button" onClick={onPlus} disabled={loading} className={stepButton}>
          +
        </button>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || disabled}
        className={`flex-1 text-even-evergreen py-3.5 md:py-4 lg:py-5 rounded-2xl flex items-center justify-center ${
          loading
            ? "bg-even-grass"
            : off
              ? "bg-tone-400 cursor-not-allowed opacity-60"
              : "bg-even-grass active:scale-95 transition-transform"
        }`}
      >
        {loading ? (
          <span className="h-6 w-40 animate-pulse rounded bg-even-evergreen/15" />
        ) : (
          <span className="text-base md:text-lg font-medium">{label} </span>
        )}
      </button>
    </div>
  );
}

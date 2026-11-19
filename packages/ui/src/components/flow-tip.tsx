"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Piezas reales de la tarjeta del flujo de pago que comparten las vistas de propina y confirmación de las cinco
 * apps. El esqueleto (`flow-skeletons`) usa las mismas clases, así la tarjeta mide lo mismo antes y después de cargar.
 */

export const TIP_OPTIONS = [0, 10, 15, 20] as const;

/** Clases de la fila de chips: 5 columnas repartidas a todo el ancho. */
export const TIP_GRID = "mt-3 grid w-full grid-cols-5 gap-2";
/** Chip de propina (17px). */
export const TIP_CHIP =
  "h-12 rounded-full border text-[17px] transition-colors cursor-pointer md:h-14 md:text-xl lg:text-2xl";
/** Etiqueta de la fila ("Propina"): cuerpo de la tarjeta, 18px. */
export const CARD_LABEL = "text-lg font-medium text-black md:text-xl lg:text-2xl";
/** Botón de pagar: ancho completo, 56px. */
export const PAY_BUTTON =
  "flex h-14 w-full items-center justify-center rounded-full bg-even-grass text-lg font-medium text-even-evergreen transition-all md:text-xl lg:text-2xl";

export type TipPickerProps = {
  label: ReactNode;
  percentage: number;
  showCustom: boolean;
  customTip: string;
  onPercentage: (percentage: number) => void;
  onCustomOpen: () => void;
  onCustomChange: (value: string) => void;
};

/** Selector de propina: etiqueta, chips 0/10/15/20/$ a todo el ancho y campo del monto libre. */
export function TipPicker({
  label,
  percentage,
  showCustom,
  customTip,
  onPercentage,
  onCustomOpen,
  onCustomChange,
}: TipPickerProps) {
  const chip = (active: boolean) =>
    cn(TIP_CHIP, "border-stroke/40 text-black", active ? "bg-even-grass text-even-evergreen" : "bg-surface hover:border-tone-400");
  return (
    <div>
      <span className={CARD_LABEL}>{label}</span>
      <div className={TIP_GRID}>
        {TIP_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPercentage(p)}
            className={chip(percentage === p && !showCustom)}
          >
            {p}%
          </button>
        ))}
        <button type="button" onClick={onCustomOpen} className={chip(showCustom)}>
          $
        </button>
      </div>
      {showCustom && (
        <div className="relative mt-3 w-full">
          <span className="absolute top-1/2 left-4 -translate-y-1/2 text-lg text-black">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={customTip}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) onCustomChange(v);
            }}
            placeholder="0.00"
            autoFocus
            className="h-12 w-full rounded-full border border-stroke/40 bg-surface pr-4 pl-8 text-center text-lg text-black focus:border-transparent focus:ring focus:ring-tone-400 focus:outline-none md:h-14"
          />
        </div>
      )}
    </div>
  );
}

/** Botón de pagar de ancho completo ("Pagar $50.60"). */
export function PayButton({
  children,
  disabled,
  onClick,
  className,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        PAY_BUTTON,
        disabled ? "cursor-not-allowed opacity-50" : "animate-pulse-button cursor-pointer active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

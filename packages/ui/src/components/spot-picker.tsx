"use client";

import { useState } from "react";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Spinner } from "./spinner";

export type SpotPickerStatus = "available" | "occupied" | "reserved" | "unknown";

export interface SpotPickerItem {
  id: string;
  status: SpotPickerStatus;
}

export interface SpotPickerLabels {
  title: string;
  subtitle: string;
  /** Etiqueta de cada casilla, p. ej. "Mesa 4" (se usa como aria-label). */
  spotLabel: (id: string) => string;
  statuses: Record<SpotPickerStatus, string>;
  filterAll: string;
  filterAvailable: string;
  empty: string;
  error: string;
  retry: string;
}

export interface SpotPickerProps {
  items: SpotPickerItem[] | null;
  loading: boolean;
  failed: boolean;
  labels: SpotPickerLabels;
  onSelect: (id: string) => void;
  onRetry: () => void;
  className?: string;
}

const dot: Record<SpotPickerStatus, string> = {
  available: "bg-even-grass",
  occupied: "bg-warning-500",
  reserved: "bg-even-aqua",
  unknown: "bg-stroke-soft",
};

const LEGEND: SpotPickerStatus[] = ["available", "occupied", "reserved"];

/**
 * Selector de mesa/habitación con su estatus. Se muestra cuando se abre un
 * servicio sin `?table=`. Presentacional: la carga de datos y la navegación
 * son de la app.
 */
export function SpotPicker({ items, loading, failed, labels, onSelect, onRetry, className }: SpotPickerProps) {
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const visible = (items ?? []).filter((i) => !onlyAvailable || i.status === "available");

  return (
    <div className={cn("mx-auto flex w-full max-w-2xl flex-col px-5 py-8 md:px-8 md:py-12", className)}>
      <img src="/brand/even-wordmark-grass.svg" alt="even" className="mb-8 h-auto w-28 md:w-36" />
      <h1 className="text-2xl font-semibold text-even-offwhite md:text-3xl">{labels.title}</h1>
      <p className="mt-2 text-sm text-even-offwhite/80 md:text-base">{labels.subtitle}</p>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-even-offwhite/80 md:text-sm">
        {LEGEND.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-full", dot[s])} />
            {labels.statuses[s]}
          </span>
        ))}
      </div>

      <div className="mt-4 flex gap-2" role="group">
        {[
          { value: false, label: labels.filterAll },
          { value: true, label: labels.filterAvailable },
        ].map((f) => (
          <button
            key={String(f.value)}
            type="button"
            aria-pressed={onlyAvailable === f.value}
            onClick={() => setOnlyAvailable(f.value)}
            className={cn(
              "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
              onlyAvailable === f.value
                ? "border-even-grass bg-even-grass text-even-evergreen"
                : "border-even-offwhite/30 text-even-offwhite",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-6" aria-live="polite">
        {loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {!loading && failed && (
          <div className="flex flex-col items-center gap-4 py-12 text-center text-even-offwhite">
            <p>{labels.error}</p>
            <Button variant="light" size="sm" onClick={onRetry}>
              {labels.retry}
            </Button>
          </div>
        )}

        {!loading && !failed && visible.length === 0 && (
          <p className="py-12 text-center text-even-offwhite/80">{labels.empty}</p>
        )}

        {!loading && !failed && visible.length > 0 && (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 md:gap-4">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-label={`${labels.spotLabel(item.id)}, ${labels.statuses[item.status]}`}
                  className="relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl bg-white text-even-evergreen shadow-sm transition-transform active:scale-95"
                >
                  <span aria-hidden className={cn("absolute right-2.5 top-2.5 size-2.5 rounded-full", dot[item.status])} />
                  <span className="text-xl font-semibold md:text-2xl">{item.id}</span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-widest text-muted md:text-xs">
                    {labels.statuses[item.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

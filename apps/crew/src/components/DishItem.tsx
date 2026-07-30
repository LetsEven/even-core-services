import type { CustomField, Dish, DishStatus } from "../types";
import { formatFolio } from "../utils/folio";

export function getOptions(customFields: CustomField[] | null | undefined): string[] {
  if (!Array.isArray(customFields)) return [];
  return customFields
    .flatMap((f) =>
      (f.selectedOptions ?? []).map((o) => {
        const qty = o.quantity ?? 1;
        const val =
          f.fieldType === "dropdown-quantity" && qty > 1
            ? `x${qty} ${o.optionName}`
            : o.optionName;
        return `${f.fieldName}: ${val}`;
      }),
    )
    .filter(Boolean);
}

const STATUS_LABELS: Record<DishStatus, string> = {
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Entregado",
};

const STATUS_BADGE: Record<DishStatus, string> = {
  preparing: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  ready: "bg-teal-500/15 text-teal-700 border-teal-500/40",
  delivered: "bg-even-grass/25 text-even-evergreen border-even-grass/50",
};

const BUTTON_ACTIVE: Record<DishStatus, string> = {
  preparing: "bg-amber-500 text-even-offwhite border-amber-500",
  ready: "bg-teal-500 text-even-offwhite border-teal-500",
  delivered: "bg-even-grass text-even-evergreen border-even-grass",
};

interface DishItemProps {
  dish: Dish;
  onStatusChange: (dishId: string, status: DishStatus) => void;
  hideStatusButtons?: boolean;
}

const STATUSES: DishStatus[] = ["preparing", "ready", "delivered"];

export default function DishItem({
  dish,
  onStatusChange,
  hideStatusButtons = false,
}: DishItemProps) {
  return (
    <div className="flex flex-col gap-3 pb-4 border-b border-even-evergreen/10 last:border-0 last:pb-0">
      {/* Info del plato */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {dish.images?.[0] ? (
            <img
              src={dish.images[0]}
              alt={dish.item}
              className="w-11 h-11 rounded-md object-cover shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-md bg-even-evergreen/10 shrink-0 flex items-center justify-center overflow-hidden">
              <img
                src="/even/even-asterisk-evergreen.svg"
                alt=""
                className="w-8 h-8 opacity-30"
              />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-even-evergreen truncate">
              {dish.quantity} {dish.item}
            </p>
            <p className="ml-2">
              {dish.userFolio && (
                <span className="shrink-0 text-lg font-mono font-semibold text-even-evergreen/60">
                  #{formatFolio(dish.userFolio)}
                </span>
              )}
            </p>
            <p className="text-base text-even-evergreen/50">
              {dish.orderedBy && <span>· {dish.orderedBy}</span>}
            </p>
            {(() => {
              const opts = getOptions(dish.customFields);
              return opts.length > 0 ? (
                <div className="mt-0.5">
                  {opts.map((opt, i) => (
                    <p key={i} className="text-xs text-even-evergreen/50">
                      {opt}
                    </p>
                  ))}
                </div>
              ) : null;
            })()}
            {dish.specialInstructions && (
              <p className="text-base text-even-evergreen/50 mt-0.5">
                Nota: {dish.specialInstructions}
              </p>
            )}
          </div>
        </div>
        {!hideStatusButtons && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded border font-medium uppercase tracking-wider shrink-0 ${STATUS_BADGE[dish.status]}`}
          >
            {STATUS_LABELS[dish.status]}
          </span>
        )}
      </div>

      {/* Botones de status */}
      {!hideStatusButtons && (
        <div className="flex gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(dish.id, s)}
              disabled={dish.status === s}
              className={`flex-1 py-1.5 text-xs rounded-md font-medium uppercase tracking-wider border transition-all active:scale-95 cursor-pointer disabled:cursor-default ${
                dish.status === s
                  ? BUTTON_ACTIVE[s]
                  : "bg-transparent text-even-evergreen/50 border-even-evergreen/20 hover:border-even-evergreen/40"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

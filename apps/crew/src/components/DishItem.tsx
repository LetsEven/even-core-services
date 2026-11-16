import { useState } from "react";
import { Loader2, Minus, Trash2 } from "lucide-react";
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
  hideStatusBadge?: boolean;
  /** Solo lectura: botones de estado deshabilitados. */
  statusReadOnly?: boolean;
  /** Oculta el botón "Entregado" (Cocina). */
  hideDelivered?: boolean;
  onQuantityChange?: (dishId: string, quantity: number) => Promise<void>;
}

const STATUSES: DishStatus[] = ["preparing", "ready", "delivered"];

export default function DishItem({
  dish,
  onStatusChange,
  hideStatusButtons = false,
  hideStatusBadge = false,
  statusReadOnly = false,
  hideDelivered = false,
  onQuantityChange,
}: DishItemProps) {
  const [pendingAction, setPendingAction] = useState<
    "reduce" | "remove" | null
  >(null);
  const [updating, setUpdating] = useState(false);
  const canEdit = !!onQuantityChange && dish.paymentStatus !== "paid";

  const handleQuantityChange = async (targetQuantity: number) => {
    if (!onQuantityChange) return;
    setUpdating(true);
    try {
      await onQuantityChange(dish.id, targetQuantity);
      setPendingAction(null);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 pb-4 border-b border-even-evergreen/10 last:border-0 last:pb-0">
      {/* Info del plato */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="font-semibold text-even-evergreen truncate">
              {canEdit ? dish.item : `${dish.quantity} ${dish.item}`}
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
        <div className="flex items-center gap-2 shrink-0">
          {!hideStatusButtons && !hideStatusBadge && (
            <span
              className={`text-[0.6875rem] px-2 py-0.5 rounded border font-medium uppercase tracking-wider shrink-0 ${STATUS_BADGE[dish.status]}`}
            >
              {STATUS_LABELS[dish.status]}
            </span>
          )}
          {canEdit && !pendingAction && (
            <div className="flex items-center gap-0.5 bg-even-evergreen/5 border border-even-evergreen/10 rounded-full px-1 py-1">
              {dish.quantity > 1 && (
                <button
                  onClick={() => setPendingAction("reduce")}
                  className="p-1 rounded-full text-even-evergreen/40 hover:text-even-evergreen hover:bg-even-evergreen/10 transition-colors cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              )}
              {dish.quantity === 1 && (
                <button
                  onClick={() => setPendingAction("remove")}
                  className="p-1 rounded-full text-even-evergreen/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="text-xs font-semibold text-even-evergreen/60 tabular-nums w-4 text-center">
                {dish.quantity}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Confirmación para reducir/eliminar el platillo */}
      {canEdit && pendingAction && (
        <div className="flex items-center justify-between gap-2 bg-rose-500/5 border border-rose-500/20 rounded-md px-3 py-2">
          <span className="text-even-evergreen/50 text-xs">
            {pendingAction === "reduce"
              ? `¿Reducir a ${dish.quantity - 1}?`
              : "¿Eliminar este platillo?"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingAction(null)}
              disabled={updating}
              className="px-3 py-1.5 bg-even-evergreen/8 border border-even-evergreen/15 hover:bg-even-evergreen/15 text-even-evergreen/60 text-xs uppercase tracking-wider rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              onClick={() =>
                handleQuantityChange(
                  pendingAction === "reduce" ? dish.quantity - 1 : 0,
                )
              }
              disabled={updating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-700 hover:bg-rose-500/25 text-xs uppercase tracking-wider rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {pendingAction === "reduce" ? "Reducir" : "Eliminar"}
            </button>
          </div>
        </div>
      )}

      {/* Botones de status */}
      {!hideStatusButtons && (
        <div className="flex gap-2">
          {STATUSES.filter((s) => !hideDelivered || s !== "delivered").map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(dish.id, s)}
              disabled={statusReadOnly || dish.status === s}
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

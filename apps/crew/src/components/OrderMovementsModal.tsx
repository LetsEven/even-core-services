import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  X,
  Plus,
  Minus,
  Banknote,
  ArrowLeftRight,
  Loader2,
  DoorOpen,
  ChefHat,
} from "lucide-react";
import type { Order, Movement } from "../types";
import { getOrderMovements } from "../services/api";

interface Props {
  order: Order;
  onClose: () => void;
}

function formatTimeOnly(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function movementIcon(type: Movement["type"]) {
  switch (type) {
    case "table_opened":
      return <DoorOpen className="w-4 h-4 text-even-grass" />;
    case "dish_added":
      return <Plus className="w-4 h-4 text-even-grass" />;
    case "dish_removed":
      return <Minus className="w-4 h-4 text-rose-400" />;
    case "waiter_changed":
      return <ArrowLeftRight className="w-4 h-4 text-amber-400" />;
    case "payment_registered":
      return <Banknote className="w-4 h-4 text-even-grass" />;
    case "table_closed":
      return <DoorOpen className="w-4 h-4 text-even-evergreen/50 rotate-180" />;
    case "dish_status_changed":
      return <ChefHat className="w-4 h-4 text-amber-400" />;
  }
}

const STATUS_LABELS: Record<string, string> = {
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Entregado",
};

function movementText(m: Movement): string {
  const d = m.details ?? {};
  switch (m.type) {
    case "table_opened":
      return `${d.guest_name ?? "Alguien"} abrió la cuenta`;
    case "dish_added": {
      const total =
        d.display_total != null
          ? Number(d.display_total)
          : Number(d.price ?? 0) * Number(d.quantity ?? 0);
      const promo = d.is_promo_item
        ? ` (promo${d.promo_discount_percentage != null ? ` ${d.promo_discount_percentage}%` : ""})`
        : "";
      return `${d.guest_name ?? "Alguien"} agregó ${d.quantity}x ${d.item}${promo} — $${total.toFixed(2)}`;
    }
    case "dish_removed": {
      const who = d.removed_by_waiter_name
        ? `por ${d.removed_by_waiter_name}`
        : "";
      const action = d.full_removal
        ? "eliminado"
        : `reducido (${d.quantity_before} → ${d.quantity_after})`;
      return `${d.item} de ${d.guest_name ?? "—"} ${action} ${who}`.trim();
    }
    case "waiter_changed":
      return `Mesero cambiado de ${d.from_waiter_name ?? "EVEN"} a ${d.to_waiter_name}`;
    case "payment_registered": {
      const amount = Number(d.display_amount ?? d.amount ?? 0);
      const remaining =
        d.remaining_after != null
          ? ` — Restante: $${Number(d.remaining_after).toFixed(2)}`
          : "";
      return `${d.guest_name ?? "Alguien"} pagó $${amount.toFixed(2)} (${d.method ?? "—"})${remaining}`;
    }
    case "table_closed":
      return "Mesa liberada — cuenta pagada por completo";
    case "dish_status_changed": {
      const before = STATUS_LABELS[d.status_before] ?? d.status_before;
      const after = STATUS_LABELS[d.status_after] ?? d.status_after;
      const who = d.changed_by_waiter_name
        ? ` (por ${d.changed_by_waiter_name})`
        : "";
      return `${d.item} de ${d.guest_name ?? "—"}: ${before} → ${after}${who}`;
    }
  }
}

export default function OrderMovementsModal({ order, onClose }: Props) {
  const { getToken } = useAuth();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const token = await getToken();
        if (!token) return;
        const data = await getOrderMovements(order.id, token);
        if (!cancelled) setMovements(data);
      } catch {
        if (!cancelled) setError("No se pudo cargar el historial");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id, getToken]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-lg overflow-hidden flex flex-col border border-white/10 shadow-2xl"
        style={{ background: "#023828", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8 shrink-0"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div>
            <p className="text-even-offwhite/40 text-xs uppercase tracking-widest mb-0.5">
              {order.identifier}
            </p>
            <h2 className="text-even-offwhite font-bold text-xl leading-none">
              Historial de movimientos
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-even-offwhite/30 hover:text-even-offwhite hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="no-scrollbar overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-3">
          {loading && (
            <div className="flex items-center justify-center py-10 text-even-offwhite/40">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-400/20 rounded-lg px-4 py-3 text-center">
              {error}
            </p>
          )}
          {!loading && !error && movements.length === 0 && (
            <p className="text-sm text-even-offwhite/40 text-center py-10">
              Todavía no hay movimientos registrados en esta mesa.
            </p>
          )}
          {!loading &&
            !error &&
            movements.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-3 rounded-lg border border-white/8 px-4 py-3"
              >
                <div className="mt-0.5 shrink-0">{movementIcon(m.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-even-offwhite/90 leading-snug">
                    {movementText(m)}
                  </p>
                  <p className="text-xs text-even-offwhite/30 mt-1">
                    {formatTimeOnly(m.createdAt)}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

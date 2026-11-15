import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Button, Modal } from "@even/ui";
import {
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
      return <DoorOpen className="w-4 h-4 text-even-evergreen" />;
    case "dish_added":
      return <Plus className="w-4 h-4 text-even-evergreen" />;
    case "dish_removed":
      return <Minus className="w-4 h-4 text-danger" />;
    case "waiter_changed":
      return <ArrowLeftRight className="w-4 h-4 text-warning" />;
    case "payment_registered":
      return <Banknote className="w-4 h-4 text-even-evergreen" />;
    case "table_closed":
      return <DoorOpen className="w-4 h-4 text-even-evergreen/50 rotate-180" />;
    case "dish_status_changed":
      return <ChefHat className="w-4 h-4 text-warning" />;
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

  return (
    <Modal
      open
      onClose={onClose}
      title="Historial de movimientos"
      description={order.identifier}
      footer={
        <Button variant="outline" fullWidth onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {loading && (
          <div className="flex items-center justify-center py-10 text-tone-500">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger">
            {error}
          </p>
        )}
        {!loading && !error && movements.length === 0 && (
          <p className="py-10 text-center text-sm text-tone-500">
            Todavía no hay movimientos registrados en esta mesa.
          </p>
        )}
        {!loading &&
          !error &&
          movements.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-3 rounded-lg border border-stroke-soft px-4 py-3"
            >
              <div className="mt-0.5 shrink-0">{movementIcon(m.type)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-tone-700">
                  {movementText(m)}
                </p>
                <p className="mt-1 text-xs text-tone-500">
                  {formatTimeOnly(m.createdAt)}
                </p>
              </div>
            </div>
          ))}
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { Badge, Modal, cn } from "@even/ui";
import type { Branch } from "../services/api";
import type { CookingStatus, DishStatus, Order } from "../types";
import OrderCard from "./OrderCard";
import {
  elapsedMinutes,
  formatElapsed,
  getOrderColumn,
  isOrderLate,
  type Column,
} from "../features/cocina/board";

// "Entregado" lo marca el mesero desde Mesas; Cocina solo ve Preparando y Listo.
const COLUMNS: { id: Column; label: string; empty: string }[] = [
  { id: "preparing", label: "Preparando", empty: "Nada en preparación" },
  { id: "ready", label: "Listo", empty: "Nada listo por entregar" },
];

interface Props {
  orders: Order[];
  onDishStatusChange: (
    orderId: string,
    orderType: string,
    dishId: string,
    status: DishStatus,
  ) => void;
  onOrderCookingStatusChange: (orderId: string, status: CookingStatus) => void;
  onPrepTimeExtraChange?: (orderId: string, extraMinutes: number) => void;
  /** Solo lectura (Cocina sin cocina.operar): sin cambios de estado. */
  readOnly?: boolean;
  currentBranch?: Branch | null;
  onOrdersRefresh?: () => void;
  availableWaiters?: { id: string; name: string }[];
  waiterSession: { id: string; name: string } | null;
  requireWaiterLogin: (
    onSuccess: (waiter: { id: string; name: string }) => void,
    options?: { forcePicker?: boolean },
  ) => void;
}

function OrderTile({
  order,
  now,
  onOpen,
}: {
  order: Order;
  now: number;
  onOpen: () => void;
}) {
  const late = isOrderLate(order, now);
  const minutes = elapsedMinutes(order, now);
  const shown = order.dishes.slice(0, 4);
  const hidden = order.dishes.length - shown.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-2 rounded-xl border bg-white p-3 text-left shadow-sm transition-all active:scale-[0.98]",
        late ? "border-danger" : "border-stroke-soft",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-even-evergreen">
            {order.identifier}
          </p>
          {order.customerName && (
            <p className="truncate text-xs text-tone-600">
              {order.customerName}
            </p>
          )}
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs font-medium",
            late ? "text-danger" : "text-tone-600",
          )}
        >
          {late ? (
            <AlertTriangle className="size-3.5" />
          ) : (
            <Clock className="size-3.5" />
          )}
          {formatElapsed(minutes)}
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 text-sm text-tone-700">
        {shown.map((d) => (
          <li key={d.id} className="flex gap-1.5">
            <span className="font-medium">{d.quantity}×</span>
            <span
              className={cn(
                "truncate capitalize",
                d.status === "delivered" && "text-tone-500 line-through",
              )}
            >
              {d.item}
            </span>
          </li>
        ))}
        {hidden > 0 && (
          <li className="text-xs text-tone-500">+{hidden} más</li>
        )}
      </ul>
      {late && (
        <Badge size="sm" variant="neutral" className="w-fit text-danger">
          Retrasada
        </Badge>
      )}
    </button>
  );
}

export default function KitchenBoard({
  orders,
  onDishStatusChange,
  onOrderCookingStatusChange,
  onPrepTimeExtraChange,
  readOnly = false,
  currentBranch,
  onOrdersRefresh,
  availableWaiters = [{ id: "EVEN", name: "EVEN" }],
  waiterSession,
  requireWaiterLogin,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Column>("preparing");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const grouped = useMemo(() => {
    const g: Record<Column, Order[]> = {
      preparing: [],
      ready: [],
      delivered: [],
    };
    for (const o of orders) {
      const col = getOrderColumn(o);
      if (col !== "delivered") g[col].push(o);
    }
    // Más antiguas primero: es lo que la cocina debe atender antes.
    for (const k of Object.keys(g) as Column[]) {
      g[k].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    return g;
  }, [orders]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  // Sin órdenes se conserva el tablero (Preparando / Listo) con
  // cada columna vacía y su mensaje, en vez de una pantalla en blanco.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Móvil: pestañas por columna */}
      <div role="tablist" className="flex gap-2 md:hidden">
        {COLUMNS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={tab === c.id}
            onClick={() => setTab(c.id)}
            className={cn(
              "min-h-11 flex-1 cursor-pointer rounded-full px-2 text-sm font-medium transition-colors",
              tab === c.id
                ? "bg-even-evergreen text-white"
                : "bg-even-evergreen/10 text-even-evergreen",
            )}
          >
            {c.label} ({grouped[c.id].length})
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        {COLUMNS.map((c) => (
          <section
            key={c.id}
            aria-label={c.label}
            className={cn(
              "min-h-0 flex-col rounded-xl bg-even-evergreen/5 p-2",
              tab === c.id ? "flex" : "hidden md:flex",
            )}
          >
            <h2 className="hidden items-center justify-between px-1 pb-2 text-xs font-semibold uppercase tracking-widest text-even-evergreen md:flex">
              {c.label}
              <span className="text-tone-600">{grouped[c.id].length}</span>
            </h2>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {grouped[c.id].length === 0 ? (
                <p className="py-8 text-center text-xs uppercase tracking-widest text-tone-500">
                  {c.empty}
                </p>
              ) : (
                grouped[c.id].map((o) => (
                  <OrderTile
                    key={o.id}
                    order={o}
                    now={now}
                    onOpen={() => setSelectedId(o.id)}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      <Modal
        open={selected != null}
        onClose={() => setSelectedId(null)}
        aria-label={selected ? `Detalle de ${selected.identifier}` : "Detalle"}
      >
        {selected && (
          <OrderCard
            order={selected}
            onDishStatusChange={(dishId, status) =>
              onDishStatusChange(
                selected.id,
                selected.orderType,
                dishId,
                status,
              )
            }
            onOrderCookingStatusChange={onOrderCookingStatusChange}
            onPrepTimeExtraChange={onPrepTimeExtraChange}
            readOnly={readOnly}
            hideDelivered
            currentBranch={currentBranch}
            onPaymentRegistered={onOrdersRefresh}
            availableWaiters={availableWaiters}
            waiterSession={waiterSession}
            requireWaiterLogin={requireWaiterLogin}
          />
        )}
      </Modal>
    </div>
  );
}

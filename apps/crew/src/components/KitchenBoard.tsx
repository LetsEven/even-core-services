import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, Check, Undo2 } from "lucide-react";
import { Badge, Modal, cn } from "@even/ui";
import type { Branch } from "../services/api";
import type { CookingStatus, DishStatus, Order } from "../types";
import OrderCard from "./OrderCard";
import { getOptions } from "./DishItem";
import {
  elapsedMinutes,
  formatElapsed,
  groupDishTickets,
  isDishLate,
  type DishColumn,
  type DishTicket,
} from "../features/cocina/board";

// La unidad de Cocina es el platillo. "Entregado" lo marca el mesero desde
// Mesas (o Pick & Go); Cocina solo ve Preparando y Listo.
const COLUMNS: { id: DishColumn; label: string; empty: string }[] = [
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

function DishTile({
  ticket,
  column,
  now,
  readOnly,
  onOpen,
  onMove,
}: {
  ticket: DishTicket;
  column: DishColumn;
  now: number;
  readOnly: boolean;
  onOpen: () => void;
  onMove: () => void;
}) {
  const { order, dish } = ticket;
  const late = isDishLate(order, dish, now);
  const minutes = elapsedMinutes(order, now);
  const options = getOptions(dish.customFields);
  const moveLabel = column === "preparing" ? "Listo" : "Regresar";
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm",
        late ? "border-danger" : "border-stroke-soft",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver pedido de ${order.identifier}`}
        className="flex cursor-pointer flex-col gap-1.5 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-base font-semibold capitalize text-even-evergreen">
            <span className="mr-1.5">{dish.quantity}×</span>
            {dish.item}
          </p>
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
        {options.length > 0 && (
          <ul className="flex flex-col text-xs text-tone-600">
            {options.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        )}
        {dish.specialInstructions && (
          <p className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-800">
            {dish.specialInstructions}
          </p>
        )}
        <p className="truncate text-xs text-tone-600">
          {order.identifier}
          {dish.orderedBy ? ` · ${dish.orderedBy}` : ""}
          {!dish.orderedBy && order.customerName
            ? ` · ${order.customerName}`
            : ""}
        </p>
        {late && (
          <Badge size="sm" variant="neutral" className="w-fit text-danger">
            Retrasado
          </Badge>
        )}
      </button>
      {!readOnly && (
        <button
          type="button"
          onClick={onMove}
          className={cn(
            "flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-transform active:scale-95",
            column === "preparing"
              ? "bg-even-grass text-even-evergreen"
              : "border border-even-evergreen/20 text-even-evergreen/70",
          )}
        >
          {column === "preparing" ? (
            <Check className="size-4" />
          ) : (
            <Undo2 className="size-4" />
          )}
          {moveLabel}
        </button>
      )}
    </div>
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
  const [tab, setTab] = useState<DishColumn>("preparing");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const grouped = useMemo(() => groupDishTickets(orders), [orders]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  // Sin platillos se conserva el tablero (Preparando / Listo) con
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
                grouped[c.id].map((ticket) => (
                  <DishTile
                    key={ticket.key}
                    ticket={ticket}
                    column={c.id}
                    now={now}
                    readOnly={readOnly}
                    onOpen={() => setSelectedId(ticket.order.id)}
                    onMove={() =>
                      onDishStatusChange(
                        ticket.order.id,
                        ticket.order.orderType,
                        ticket.dish.id,
                        c.id === "preparing" ? "ready" : "preparing",
                      )
                    }
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

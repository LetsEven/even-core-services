import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  History,
} from "lucide-react";
import { Badge, Button, Card, cn } from "@even/ui";
import type { Order, OrderType } from "../types";
import { formatFolio } from "../utils/folio";
import { getOptions } from "../components/DishItem";
import OrderMovementsModal from "../components/OrderMovementsModal";
import { useCaja } from "../features/caja/context";
import { formatDateTime } from "../features/caja/dateRange";
import {
  formatMoney,
  paymentBucket,
  summarizeOrders,
} from "../features/caja/summary";

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  tap: "Tap Order & Pay",
  pick_and_go: "Pick & Go",
  room: "Room Service",
  tap_pay: "Tap & Pay",
  flex_bill: "Flex Bill",
};

const METHOD_LABELS = {
  cash: "Efectivo",
  terminal: "Terminal",
  digital: "Digital",
} as const;

function isDelivered(order: Order) {
  return order.orderType === "pick_and_go"
    ? order.cookingStatus === "delivered"
    : order.dishes.every((d) => d.status === "delivered");
}

function OrderRow({
  order,
  onMovements,
}: {
  order: Order;
  onMovements: (o: Order) => void;
}) {
  const [open, setOpen] = useState(false);
  const delivered = isDelivered(order);
  const total = summarizeOrders([order]);
  const charged = total.sales + total.tips;

  return (
    <Card padding="none" className="rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer hover:bg-even-evergreen/5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">
              {order.identifier}
            </span>
            <Badge variant="soft" size="sm">
              {ORDER_TYPE_LABELS[order.orderType]}
            </Badge>
            {order.folio != null && (
              <span className="font-mono text-xs bg-even-grass/25 px-1.5 py-0.5 rounded">
                #{formatFolio(order.folio)}
              </span>
            )}
          </div>
          <p className="text-xs text-even-evergreen/55 truncate">
            {formatDateTime(order.createdAt)}
            {order.customerName ? ` · ${order.customerName}` : ""}
            {order.waiterName ? ` · ${order.waiterName}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold tabular-nums">
            {formatMoney(charged)}
          </p>
          <p
            className={cn(
              "flex items-center justify-end gap-1 text-[0.6875rem] font-medium",
              delivered ? "text-even-evergreen/70" : "text-amber-600",
            )}
          >
            {delivered ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <Clock className="w-3 h-3" />
            )}
            {delivered ? "Completado" : "Pendiente"}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-even-evergreen/40 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-even-evergreen/10 px-3 py-3 space-y-3 bg-even-offwhite/40">
          <div className="divide-y divide-even-evergreen/10">
            {order.dishes.map((dish) => {
              const opts = getOptions(dish.customFields);
              return (
                <div key={dish.id} className="py-1.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm">
                    <span className="text-even-evergreen/50">
                      {dish.quantity}×
                    </span>
                    <span className="font-medium">{dish.item}</span>
                    {dish.orderedBy && (
                      <span className="text-even-evergreen/50">
                        · {dish.orderedBy}
                      </span>
                    )}
                    {dish.userFolio && (
                      <span className="font-mono text-xs bg-even-grass/25 px-1.5 py-0.5 rounded">
                        #{formatFolio(dish.userFolio)}
                      </span>
                    )}
                  </div>
                  {opts.map((opt, i) => (
                    <p
                      key={i}
                      className="pl-4 text-xs text-even-evergreen/45"
                    >
                      {opt}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>

          {order.orderType === "flex_bill" && order.totalAmount != null && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-even-evergreen/10 text-xs text-even-evergreen/60">
              <span>
                Total{" "}
                <b className="text-even-evergreen">
                  {formatMoney(order.totalDisplayAmount ?? order.totalAmount)}
                </b>
              </span>
              <span>
                Pagado{" "}
                <b className="text-even-evergreen">
                  {formatMoney(
                    order.paidDisplayAmount ?? order.paidAmount ?? 0,
                  )}
                </b>
              </span>
              {(order.remainingAmount ?? 0) > 0 && (
                <span>
                  Restante{" "}
                  <b className="text-amber-600">
                    {formatMoney(
                      order.remainingDisplayAmount ?? order.remainingAmount!,
                    )}
                  </b>
                </span>
              )}
            </div>
          )}

          {(order.payments?.length ?? 0) > 0 && (
            <div className="pt-2 border-t border-even-evergreen/10 space-y-1">
              <p className="text-[0.6875rem] uppercase tracking-wider text-even-evergreen/50">
                Pagos
              </p>
              {order.payments!.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span>
                    {METHOD_LABELS[paymentBucket(p.cardType)]}
                    {p.guestName ? ` · ${p.guestName}` : ""}
                    <span className="text-even-evergreen/50">
                      {" "}
                      · {formatDateTime(p.createdAt)}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(p.baseAmount)}
                    {p.tipAmount > 0 && (
                      <span className="text-even-evergreen/50">
                        {" "}
                        + {formatMoney(p.tipAmount)} propina
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {order.orderType === "flex_bill" && (
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onClick={() => onMovements(order)}
            >
              <History className="w-4 h-4" />
              Ver historial
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// Pestaña "Órdenes" de Caja: datos, periodo y búsqueda vienen de CajaLayout.
export default function Historial() {
  const { visibleOrders, orders, loading, ordersError, refresh, query } =
    useCaja();
  const [movementsOrder, setMovementsOrder] = useState<Order | null>(null);

  if (loading && orders.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-even-evergreen/15 border-t-even-grass rounded-full animate-spin" />
      </div>
    );
  }
  if (ordersError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">Error al cargar órdenes</p>
        <p className="text-sm text-even-evergreen/60">{ordersError}</p>
        <Button size="sm" onClick={refresh}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (visibleOrders.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-even-evergreen/50">
          {query
            ? "Ninguna orden coincide con la búsqueda"
            : "No hay órdenes en este período"}
        </p>
      </div>
    );
  }
  return (
    <>
      <p className="shrink-0 pb-2 text-xs text-even-evergreen/50">
        {visibleOrders.length} orden(es)
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
        {visibleOrders.map((o) => (
          <OrderRow key={o.id} order={o} onMovements={setMovementsOrder} />
        ))}
      </div>
      {movementsOrder && (
        <OrderMovementsModal
          order={movementsOrder}
          onClose={() => setMovementsOrder(null)}
        />
      )}
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  RefreshCw,
  ChevronLeft,
  ChevronDown,
  Check,
  CheckCircle2,
  Clock,
  History,
} from "lucide-react";
import { getOrderHistory, getAvailableMonths } from "../services/api";
import type { Order, OrderType } from "../types";
import { formatFolio } from "../utils/folio";
import { getOptions } from "../components/DishItem";
import OrderMovementsModal from "../components/OrderMovementsModal";

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  tap: "Tap Order & Pay",
  pick_and_go: "Pick & Go",
  room: "Room Service",
  tap_pay: "Tap & Pay",
  flex_bill: "Flex Bill",
};

const ORDER_TYPE_COLORS: Record<OrderType, string> = {
  tap: "bg-blue-500/15 text-blue-700",
  pick_and_go: "bg-orange-500/15 text-orange-700",
  room: "bg-pink-500/15 text-pink-700",
  tap_pay: "bg-cyan-500/15 text-cyan-700",
  flex_bill: "bg-purple-500/15 text-purple-700",
};

const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function monthLabel(ym: string) {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES_ES[parseInt(month) - 1]} ${year}`;
}

type Filter = "today" | "last7" | "last30" | string;

function getDateRange(filter: Filter): { since: string; until: string } {
  const now = new Date();
  if (filter === "today") {
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    const until = new Date(now);
    until.setHours(23, 59, 59, 999);
    return { since: since.toISOString(), until: until.toISOString() };
  }
  if (filter === "last7") {
    const since = new Date(now);
    since.setDate(since.getDate() - 7);
    since.setHours(0, 0, 0, 0);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  if (filter === "last30") {
    const since = new Date(now);
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  // month: "2026-05"
  const [year, month] = filter.split("-").map(Number);
  const since = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const until = new Date(year, month, 0, 23, 59, 59, 999);
  return { since: since.toISOString(), until: until.toISOString() };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  onBack: () => void;
  branchesLoading: boolean;
  branchId: string | null;
}

export default function Historial({
  onBack,
  branchesLoading,
  branchId,
}: Props) {
  const { getToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<Filter>("today");
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [movementsOrder, setMovementsOrder] = useState<Order | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(
    async (showSpinner = true, filter: Filter = selectedFilter) => {
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) return;
        const { since, until } = getDateRange(filter);
        const data = await getOrderHistory(token, branchId, since, until);
        setOrders(data);
      } catch (e: any) {
        setError(e.message ?? "Error al cargar historial");
      } finally {
        setLoading(false);
      }
    },
    [getToken, branchId, selectedFilter],
  );

  const fetchAvailableMonths = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const months = await getAvailableMonths(token, branchId);
      setAvailableMonths(months);
    } catch {
      setAvailableMonths([]);
    }
  }, [getToken, branchId]);

  useEffect(() => {
    if (branchId) {
      fetchAvailableMonths();
    }
  }, [fetchAvailableMonths, branchId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    if (filterOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterOpen]);

  const handleFilterChange = (f: Filter) => {
    setSelectedFilter(f);
    fetchHistory(true, f);
  };

  const FIXED_FILTERS: { id: Filter; label: string }[] = [
    { id: "today", label: "Hoy" },
    { id: "last7", label: "7 días" },
    { id: "last30", label: "30 días" },
  ];

  const allFilters = [
    ...FIXED_FILTERS,
    ...availableMonths.map((ym) => ({ id: ym, label: monthLabel(ym) })),
  ];

  const selectedLabel =
    allFilters.find((f) => f.id === selectedFilter)?.label ?? "Hoy";

  return (
    <div
      className="relative flex-1 flex flex-col"
      style={{ background: "#023828" }}
    >
      {/* Header */}
      <header className="px-5 pt-5 pb-2 flex items-center justify-between relative">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-even-offwhite/60 hover:text-even-offwhite hover:bg-white/10 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <img
          src="/even/even-asterisk-grass.svg"
          className="absolute left-1/2 -translate-x-1/2 w-8 h-8"
          alt="Even"
        />

        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchHistory(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-even-offwhite/60 hover:text-even-offwhite hover:bg-white/10 transition-colors text-sm disabled:opacity-50 cursor-pointer disabled:cursor-default"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </header>

      {/* Título y selector de sucursal */}
      <div className="flex flex-col items-center pb-3 gap-1">
        <h1 className="text-even-offwhite font-medium text-xl uppercase tracking-widest">
          Historial
        </h1>

        {/* Filter dropdown */}
        {branchId && (
          <div className="relative pt-2" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-even-offwhite/80 text-xs uppercase tracking-wider rounded-md px-4 py-1.5 border border-white/10 transition-colors cursor-pointer"
            >
              <span>{selectedLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-even-offwhite/40 transition-transform ${filterOpen ? "rotate-180" : ""}`}
              />
            </button>
            {filterOpen && (
              <ul className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 min-w-full w-max bg-even-evergreen border border-white/10 rounded-lg overflow-hidden shadow-xl max-h-64 overflow-y-auto">
                {allFilters.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => {
                        handleFilterChange(f.id);
                        setFilterOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-4 px-4 py-2.5 text-sm text-even-offwhite/80 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <span>{f.label}</span>
                      {f.id === selectedFilter && (
                        <Check className="w-3.5 h-3.5 text-even-grass shrink-0" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!loading && !error && branchId && (
          <p className="text-even-offwhite/50 text-sm pt-1">
            {orders.length} orden(es)
          </p>
        )}
      </div>

      {/* Panel de contenido */}
      <div
        className="flex-1 rounded-t-lg px-5 pt-6 pb-6 flex flex-col min-h-0 overflow-hidden text-even-evergreen"
        style={{ background: "#FEFEEB" }}
      >
        {branchesLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-even-evergreen/15 border-t-even-grass rounded-full animate-spin" />
          </div>
        ) : !branchId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-even-evergreen/70">
            <p className="font-medium text-even-evergreen">
              Selecciona una sucursal
            </p>
            <p className="text-sm text-center">
              Usa el selector de arriba para ver el historial de la sucursal.
            </p>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-even-evergreen/15 border-t-even-grass rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-even-evergreen/70">
            <p className="font-medium text-even-evergreen">
              Error al cargar historial
            </p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => fetchHistory(true)}
              className="px-4 py-2 bg-even-grass text-even-evergreen rounded-md text-xs uppercase tracking-wider font-medium hover:bg-even-grass/90 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-even-evergreen/50 text-sm">
              No hay órdenes en este período
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
            {orders.map((order) => {
              const allDelivered =
                order.orderType === "pick_and_go"
                  ? order.cookingStatus === "delivered"
                  : order.dishes.every((d) => d.status === "delivered");
              return (
                <div
                  key={order.id}
                  className="bg-white border border-even-evergreen/20 shadow-sm hover:shadow-md transition-shadow rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[0.6875rem] font-medium px-2 py-0.5 rounded uppercase tracking-wider ${ORDER_TYPE_COLORS[order.orderType]}`}
                      >
                        {ORDER_TYPE_LABELS[order.orderType]}
                      </span>
                      <span className="text-even-evergreen font-semibold text-base">
                        {order.identifier}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {allDelivered ? (
                        <span className="flex items-center gap-1 text-xs text-even-evergreen font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Completado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-even-evergreen/50">
                    <span>{formatDateTime(order.createdAt)}</span>
                    {order.folio != null && (
                      <span className="text-even-evergreen ml-1 font-mono text-xs bg-even-grass/25 px-2 py-0.5 rounded">
                        #{formatFolio(order.folio)}
                      </span>
                    )}
                  </div>

                  <div className="divide-y divide-even-evergreen/10">
                    {order.dishes.map((dish) => {
                      const opts = getOptions(dish.customFields);
                      return (
                        <div
                          key={dish.id}
                          className="py-1.5 first:pt-0 last:pb-0"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap text-sm text-even-evergreen/80">
                            <span className="text-even-evergreen/50">
                              {dish.quantity}×
                            </span>
                            <span className="text-even-evergreen font-medium">
                              {dish.item}
                            </span>
                            {dish.orderedBy && (
                              <span className="text-even-evergreen/50">
                                · {dish.orderedBy}
                              </span>
                            )}
                            {dish.userFolio && (
                              <span className="text-even-evergreen font-mono text-xs bg-even-grass/25 px-2 py-0.5 rounded">
                                #{formatFolio(dish.userFolio)}
                              </span>
                            )}
                          </div>
                          {opts.length > 0 && (
                            <div className="mt-0.5 pl-4 space-y-0.5">
                              {opts.map((opt, i) => (
                                <p
                                  key={i}
                                  className="text-xs text-even-evergreen/45"
                                >
                                  {opt}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {order.orderType === "flex_bill" &&
                    order.totalAmount != null &&
                    (() => {
                      // tipTotal solo lo usaba "Pagado + propina", comentado
                      // por ahora más abajo.
                      // const tipTotal = (order.payments ?? []).reduce(
                      //   (sum, p) => sum + (p.tipAmount ?? 0),
                      //   0,
                      // );
                      return (
                        <div className="flex items-center gap-4 pt-2 border-t border-even-evergreen/10 text-xs">
                          <span className="text-even-evergreen/60">
                            Total{" "}
                            <span className="text-even-evergreen font-medium">
                              $
                              {(
                                order.totalDisplayAmount ?? order.totalAmount!
                              ).toFixed(2)}
                            </span>
                          </span>
                          <span className="text-even-evergreen/60">
                            Pagado{" "}
                            <span className="text-even-evergreen font-medium">
                              $
                              {(
                                order.paidDisplayAmount ??
                                order.paidAmount ??
                                0
                              ).toFixed(2)}
                            </span>
                          </span>
                          {(order.remainingAmount ?? 0) > 0 && (
                            <span className="text-even-evergreen/60">
                              Restante{" "}
                              <span className="text-amber-600 font-medium">
                                $
                                {(
                                  order.remainingDisplayAmount ??
                                  order.remainingAmount!
                                ).toFixed(2)}
                              </span>
                            </span>
                          )}
                          {/* Comentado por ahora — ver conversación sobre Pagado + propina
                          <span className="text-even-evergreen/60">
                            Pagado + propina{" "}
                            <span className="text-even-evergreen font-medium">
                              $
                              {(
                                (order.totalDisplayAmount ??
                                  order.totalAmount!) + tipTotal
                              ).toFixed(2)}
                            </span>
                          </span>
                          */}
                        </div>
                      );
                    })()}

                  {order.orderType === "flex_bill" && (
                    <button
                      onClick={() => setMovementsOrder(order)}
                      className="flex items-center justify-center gap-2 w-full py-2 rounded-md bg-even-evergreen/10 hover:bg-even-evergreen/15 text-even-evergreen/80 text-xs font-medium uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      Ver historial
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {movementsOrder && (
        <OrderMovementsModal
          order={movementsOrder}
          onClose={() => setMovementsOrder(null)}
        />
      )}
    </div>
  );
}

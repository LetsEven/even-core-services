import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { ChevronDown, Check, Loader2, ArrowLeft } from "lucide-react";
import { peekTablePOS, openTableAccount, type Branch } from "../services/api";
import type { Order, DishStatus, CookingStatus, OrderType } from "../types";
import { parseLocationCode } from "../utils/identifier";
import { useUnseenOrders } from "../hooks/useUnseenOrders";
import OrderCard from "./OrderCard";
import OpenTableWithDishesModal from "./OpenTableWithDishesModal";
import AppHeader from "./AppHeader";

// Pantalla principal ("croquis") reusada por Tap & Pay, Tap Order & Pay,
// Flex Bill y Room Service — generaliza lo que antes era Mesas.tsx
// (exclusivo de Tap & Pay) para que cada servicio la use con su propia
// fuente de datos (mesas u habitaciones) y sus propias reglas de click.

export interface SpatialUnit {
  id: string;
  number: string;
  status: "available" | "occupied" | "maintenance";
  has_open_account: boolean;
  has_tap_pay_account?: boolean;
}

export interface SpatialGridConfig {
  orderType: OrderType;
  unitLabel: string; // "Mesa" | "Habitación"
  pluralLabel: string; // "Mesas" | "Habitaciones"
  fetchUnits: (branchId: string, token: string) => Promise<SpatialUnit[]>;
  freeUnitClickable: boolean;
  pulseKind: "new_unseen" | "pos_pending" | "none";
}

interface Props {
  config: SpatialGridConfig;
  onOpenPrinters: () => void;
  onOpenHistorial: () => void;
  branchId: string | null;
  branches: Branch[];
  branchesLoading: boolean;
  onBranchChange: (id: string) => void;
  orders: Order[];
  onDishStatusChange: (
    orderId: string,
    orderType: string,
    dishId: string,
    status: DishStatus,
  ) => void;
  onOrderCookingStatusChange: (orderId: string, status: CookingStatus) => void;
  onPrepTimeExtraChange?: (orderId: string, extraMinutes: number) => void;
  onOrdersRefresh: () => void;
  availableWaiters?: { id: string; name: string }[];
}

function circleClass(unit: SpatialUnit, active: boolean, pulsing: boolean): string {
  if (unit.status === "maintenance")
    return "bg-even-evergreen/5 border border-even-evergreen/10 text-even-evergreen/25 cursor-default";
  if (unit.has_tap_pay_account)
    return "bg-even-evergreen border border-even-evergreen text-even-offwhite shadow-[0_0_18px_rgba(2,56,40,0.25)] hover:bg-even-evergreen/90 active:scale-90";
  if (active) {
    const base =
      "bg-even-grass border border-even-grass/60 text-even-evergreen hover:bg-even-grass/90 active:scale-90";
    // Pulsing usa animate-pulse-ring (box-shadow animado) en vez del glow
    // estático, para no pisarse entre sí — ver @keyframes pulse-ring en index.css.
    return pulsing
      ? `${base} animate-pulse-ring`
      : `${base} shadow-[0_0_20px_rgba(130,230,87,0.45)]`;
  }
  if (pulsing)
    return "bg-even-grass border border-even-grass/60 text-even-evergreen hover:bg-even-grass/90 active:scale-90 animate-pulse-ring";
  return "bg-white border border-even-evergreen/15 text-even-evergreen shadow-sm hover:bg-even-evergreen/5 active:scale-90";
}

export default function SpatialGrid({
  config,
  onOpenPrinters,
  onOpenHistorial,
  branchId,
  branches,
  branchesLoading,
  onBranchChange,
  orders,
  onDishStatusChange,
  onOrderCookingStatusChange,
  onPrepTimeExtraChange,
  onOrdersRefresh,
  availableWaiters = [{ id: "EVEN", name: "EVEN" }],
}: Props) {
  const { getToken } = useAuth();
  const unseenOrders = useUnseenOrders(branchId);

  const [units, setUnits] = useState<SpatialUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posUnits, setPosUnits] = useState<Set<string>>(new Set());

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  // Derivado de `orders` (no una copia congelada) para que el OrderCard del
  // modal refleje cambios de estado en vivo (socket/poll) mientras está abierto.
  const selectedOrder = selectedOrderId
    ? (orders.find((o) => o.id === selectedOrderId) ?? null)
    : null;
  const [checkingUnitId, setCheckingUnitId] = useState<string | null>(null);
  const [confirmUnit, setConfirmUnit] = useState<SpatialUnit | null>(null);
  const [openingAccount, setOpeningAccount] = useState(false);
  const [serviceChoiceUnit, setServiceChoiceUnit] =
    useState<SpatialUnit | null>(null);
  const [openDishesUnit, setOpenDishesUnit] = useState<SpatialUnit | null>(
    null,
  );

  const [branchOpen, setBranchOpen] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);

  const branch = branches.find((b) => b.id === branchId) ?? null;

  const fetchData = useCallback(
    async (showSpinner = true) => {
      if (!branchId) return;
      if (showSpinner) setLoading(true);
      setError(null);
      setPosUnits(new Set());
      try {
        const token = await getToken();
        if (!token) return;
        const data = await config.fetchUnits(branchId, token);
        setUnits(data);

        if (config.pulseKind === "pos_pending") {
          const freeUnits = data.filter(
            (u) => !u.has_open_account && u.status !== "maintenance",
          );
          Promise.allSettled(
            freeUnits.map((u) =>
              peekTablePOS(branchId, u.number, token).then((has) => ({
                number: u.number,
                has,
              })),
            ),
          ).then((results) => {
            const posSet = new Set<string>();
            for (const r of results) {
              if (r.status === "fulfilled" && r.value.has)
                posSet.add(r.value.number);
            }
            setPosUnits(posSet);
          });
        }
      } catch (e: unknown) {
        setError(
          e instanceof Error
            ? e.message
            : `Error al cargar ${config.pluralLabel.toLowerCase()}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [getToken, branchId, config],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresco periódico — mismo patrón que Kitchen.tsx (handleActualizar).
  // No depender solo del socket: si el evento no llega (reconexión, o una
  // orden creada desde otro backend que comparte la misma DB pero no el
  // mismo servidor de sockets), esto igual pone `units`/`orders` al día.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && !loading) {
        fetchData(false);
        onOrdersRefresh();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [fetchData, loading, onOrdersRefresh]);

  useEffect(() => {
    unseenOrders.pruneTo(orders.map((o) => o.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setBranchOpen(false);
      }
    };
    if (branchOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [branchOpen]);

  function findOrderForUnit(unitNumber: string): Order | undefined {
    return orders.find(
      (o) =>
        o.orderType === config.orderType &&
        parseLocationCode(o.identifier) === unitNumber,
    );
  }

  // `unit.has_open_account` viene de un fetch separado (getTablesForBranch/
  // getRoomsForBranch) al de `orders` — si por una carrera entre los dos
  // fetches o datos huérfanos llegan a desalinearse, una cuenta realmente
  // abierta (existe en `orders`) no debe quedar invisible en el croquis.
  function isUnitActive(unit: SpatialUnit): boolean {
    return unit.has_open_account || findOrderForUnit(unit.number) !== undefined;
  }

  function isPulsing(unit: SpatialUnit, active: boolean): boolean {
    if (config.pulseKind === "pos_pending") {
      return !active && posUnits.has(unit.number);
    }
    if (config.pulseKind === "new_unseen" && active) {
      const order = findOrderForUnit(unit.number);
      return order ? unseenOrders.isUnseen(order.id) : false;
    }
    return false;
  }

  async function handleUnitClick(unit: SpatialUnit) {
    if (unit.status === "maintenance" || checkingUnitId) return;

    if (isUnitActive(unit)) {
      const order = findOrderForUnit(unit.number);
      if (order) {
        unseenOrders.markSeen(order.id);
        setSelectedOrderId(order.id);
      }
      return;
    }

    if (config.orderType === "tap_pay") {
      setCheckingUnitId(unit.id);
      try {
        const token = await getToken();
        if (!token) return;
        if (posUnits.has(unit.number)) {
          setConfirmUnit(unit);
        } else {
          const hasPOS = await peekTablePOS(branchId!, unit.number, token);
          if (hasPOS) setConfirmUnit(unit);
        }
      } catch {
        // silently fail
      } finally {
        setCheckingUnitId(null);
      }
      return;
    }

    if (config.orderType === "flex_bill" && config.freeUnitClickable) {
      setOpenDishesUnit(unit);
    }
  }

  async function handleConfirmOpen(service?: "tap_pay" | "flex_bill") {
    const unit = confirmUnit ?? serviceChoiceUnit;
    if (!branchId || !unit) return;
    setOpeningAccount(true);
    try {
      const token = await getToken();
      if (!token) return;
      const result = await openTableAccount(
        branchId,
        unit.number,
        token,
        service,
      );
      if (result.needsServiceChoice) {
        setServiceChoiceUnit(unit);
        setConfirmUnit(null);
        return;
      }
      if (result.order) {
        fetchData(false);
        onOrdersRefresh();
      }
      setServiceChoiceUnit(null);
    } catch (err) {
      console.error("[SPATIAL-GRID] handleConfirmOpen error:", err);
    } finally {
      setConfirmUnit(null);
      setOpeningAccount(false);
    }
  }

  // Cuentas activas DE ESTE servicio (no mesas ocupadas por cualquier
  // servicio — eso ya lo refleja el color del círculo). `orders` ya viene
  // filtrado a "activas" desde el backend (getActiveOrders), así que contar
  // por orderType alcanza — importa para Flex Bill en particular, donde una
  // mesa "ocupada" puede tener cuentas de otro servicio y no de este.
  const activeCount = orders.filter(
    (o) => o.orderType === config.orderType,
  ).length;
  const tapPayCount = units.filter((u) => u.has_tap_pay_account).length;
  const availableCount = units.filter(
    (u) => !isUnitActive(u) && u.status !== "maintenance",
  ).length;

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col"
      style={{ background: "#023828" }}
    >
      <AppHeader
        onOpenPrinters={onOpenPrinters}
        onOpenHistorial={onOpenHistorial}
        onRefresh={() => fetchData(true)}
        refreshing={loading}
      />

      {/* Title + stats — no se muestra al ver el detalle de una orden */}
      {!selectedOrder && (
        <div className="flex flex-col items-center pb-5 gap-1">
          <h1 className="text-even-offwhite font-medium text-xl uppercase tracking-widest">
            {config.pluralLabel}
          </h1>
          {branches.length > 0 && (
            <div className="relative" ref={branchRef}>
              <button
                onClick={() => setBranchOpen((v) => !v)}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-even-offwhite/80 text-xs uppercase tracking-wider rounded-md px-4 py-1.5 border border-white/10 transition-colors cursor-pointer"
              >
                <span>{branch?.name ?? "Seleccionar sucursal"}</span>
                {branches.length > 1 && (
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-even-offwhite/40 transition-transform ${branchOpen ? "rotate-180" : ""}`}
                  />
                )}
              </button>
              {branchOpen && branches.length > 1 && (
                <ul className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 min-w-full w-max bg-even-evergreen border border-white/10 rounded-lg overflow-hidden shadow-xl">
                  {branches.map((b) => (
                    <li key={b.id}>
                      <button
                        onClick={() => {
                          onBranchChange(b.id);
                          setBranchOpen(false);
                        }}
                        className="w-full flex items-center justify-between gap-4 px-4 py-2.5 text-sm text-even-offwhite/80 hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        <span>{b.name}</span>
                        {b.id === branchId && (
                          <Check className="w-3.5 h-3.5 text-even-grass shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {units.length > 0 && !loading && (
            <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
              {tapPayCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded uppercase tracking-wider bg-white/15 border border-white/30 text-even-offwhite font-medium">
                  {tapPayCount} en cobro
                </span>
              )}
              {activeCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded uppercase tracking-wider bg-even-grass/20 border border-even-grass/30 text-even-grass font-medium">
                  {activeCount}{" "}
                  {activeCount === 1 ? "cuenta activa" : "cuentas activas"}
                </span>
              )}
              <span className="text-[11px] px-2 py-0.5 rounded uppercase tracking-wider bg-white/10 border border-white/15 text-even-offwhite/60 font-medium">
                {availableCount} {availableCount === 1 ? "libre" : "libres"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Glass panel — croquis o, si hay una orden seleccionada, su detalle */}
      <div
        className="flex-1 rounded-t-lg px-6 py-6 flex flex-col min-h-0 overflow-y-auto text-even-evergreen"
        style={{ background: "#FEFEEB" }}
      >
        {selectedOrder ? (
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setSelectedOrderId(null)}
              className="self-start flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-even-evergreen/60 hover:text-even-evergreen transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a {config.pluralLabel.toLowerCase()}
            </button>
            <OrderCard
              order={selectedOrder}
              onDishStatusChange={(dishId, status) =>
                onDishStatusChange(
                  selectedOrder.id,
                  selectedOrder.orderType,
                  dishId,
                  status,
                )
              }
              onOrderCookingStatusChange={onOrderCookingStatusChange}
              onPrepTimeExtraChange={onPrepTimeExtraChange}
              currentBranch={branch}
              onPaymentRegistered={() => {
                onOrdersRefresh();
              }}
              availableWaiters={availableWaiters}
            />
          </div>
        ) : (
          <>
            {!branchId && (
              <p className="text-even-evergreen/50 text-center mt-10">
                Selecciona una sucursal para ver{" "}
                {config.pluralLabel.toLowerCase()}.
              </p>
            )}

            {branchId && (loading || branchesLoading) && (
              <div className="flex justify-center mt-16">
                <Loader2 className="w-8 h-8 text-even-evergreen/40 animate-spin" />
              </div>
            )}

            {branchId && !loading && error && (
              <p className="text-rose-600 text-center mt-10 text-sm">
                {error}
              </p>
            )}

            {branchId && !loading && !error && units.length === 0 && (
              <p className="text-even-evergreen/50 text-center mt-10 text-sm">
                No hay {config.pluralLabel.toLowerCase()} registradas para
                esta sucursal.
              </p>
            )}

            {branchId && !loading && !error && units.length > 0 && (
              <div className="grid grid-cols-4 gap-4 justify-items-center">
                {units.map((unit) => {
                  const active = isUnitActive(unit);
                  return (
                    <button
                      key={unit.id}
                      onClick={() => handleUnitClick(unit)}
                      disabled={
                        unit.status === "maintenance" || !!checkingUnitId
                      }
                      className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-150 disabled:cursor-default cursor-pointer ${circleClass(unit, active, isPulsing(unit, active))}`}
                    >
                      {checkingUnitId === unit.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        unit.number
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmación abrir cuenta (Tap & Pay — ticket en POS por liquidar) */}
      {confirmUnit && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            className="w-full max-w-sm rounded-t-lg sm:rounded-lg border border-white/10 shadow-2xl px-6 py-6 flex flex-col gap-5"
            style={{ background: "#023828" }}
          >
            <div>
              <p className="text-even-offwhite/40 text-xs uppercase tracking-widest mb-1">
                {config.unitLabel} {confirmUnit.number}
              </p>
              <h2 className="text-even-offwhite font-bold text-xl">
                ¿Liquidar cuenta?
              </h2>
              <p className="text-even-offwhite/50 text-sm mt-1">
                Hay una orden activa en el POS para esta mesa.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmUnit(null)}
                disabled={openingAccount}
                className="flex-1 py-3 rounded-md border border-white/15 text-even-offwhite/60 text-xs font-medium uppercase tracking-wider hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirmOpen()}
                disabled={openingAccount}
                className="flex-1 py-3 rounded-md bg-even-grass hover:bg-even-grass/90 text-even-evergreen text-xs font-medium uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2"
              >
                {openingAccount && <Loader2 className="w-4 h-4 animate-spin" />}
                Liquidar cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Elegir servicio (cliente tiene Tap & Pay y Flex Bill contratados) */}
      {serviceChoiceUnit && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            className="w-full max-w-sm rounded-t-lg sm:rounded-lg border border-white/10 shadow-2xl px-6 py-6 flex flex-col gap-5"
            style={{ background: "#023828" }}
          >
            <div>
              <p className="text-even-offwhite/40 text-xs uppercase tracking-widest mb-1">
                {config.unitLabel} {serviceChoiceUnit.number}
              </p>
              <h2 className="text-even-offwhite font-bold text-xl">
                ¿Qué servicio usar?
              </h2>
              <p className="text-even-offwhite/50 text-sm mt-1">
                Esta sucursal tiene Tap & Pay y Flex Bill activos.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleConfirmOpen("tap_pay")}
                disabled={openingAccount}
                className="flex-1 py-3 rounded-md border border-white/15 text-even-offwhite text-xs font-medium uppercase tracking-wider hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default flex items-center justify-center gap-2"
              >
                {openingAccount && <Loader2 className="w-4 h-4 animate-spin" />}
                Tap & Pay
              </button>
              <button
                onClick={() => handleConfirmOpen("flex_bill")}
                disabled={openingAccount}
                className="flex-1 py-3 rounded-md bg-even-grass hover:bg-even-grass/90 text-even-evergreen text-xs font-medium uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2"
              >
                {openingAccount && <Loader2 className="w-4 h-4 animate-spin" />}
                Flex Bill
              </button>
            </div>
            <button
              onClick={() => setServiceChoiceUnit(null)}
              disabled={openingAccount}
              className="text-even-offwhite/40 text-xs uppercase tracking-wider hover:text-even-offwhite/70 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Flex Bill — mesa libre: elegir platillos y abrir */}
      {openDishesUnit && branch && (
        <OpenTableWithDishesModal
          branch={branch}
          tableNumber={openDishesUnit.number}
          onClose={() => setOpenDishesUnit(null)}
          onSuccess={() => {
            setOpenDishesUnit(null);
            fetchData(false);
            onOrdersRefresh();
          }}
        />
      )}

    </div>
  );
}

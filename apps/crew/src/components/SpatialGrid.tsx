import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader2, Move } from "lucide-react";
import {
  peekTablePOS,
  peekTablePOSBatch,
  openTableAccount,
  syncFlexBillTableFromPOS,
  type Branch,
  type ReorderUnit,
} from "../services/api";
import type { Order, DishStatus, CookingStatus, OrderType } from "../types";
import { parseLocationCode } from "../utils/identifier";
import { useRegisterRefresh } from "../app/refresh";

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
  reorderUnits: (
    branchId: string,
    order: ReorderUnit[],
    token: string,
  ) => Promise<void>;
  freeUnitClickable: boolean;
  pulseKind: "preparing" | "pos_pending" | "none";
}

interface Props {
  config: SpatialGridConfig;
  branchId: string | null;
  branches: Branch[];
  branchesLoading: boolean;
  orders: Order[];
  onDishStatusChange: (
    orderId: string,
    orderType: string,
    dishId: string,
    status: DishStatus,
    waiterName?: string | null,
    waiterId?: string | null,
  ) => void | Promise<void>;
  onOrderCookingStatusChange: (
    orderId: string,
    status: CookingStatus,
  ) => void | Promise<void>;
  onPrepTimeExtraChange?: (orderId: string, extraMinutes: number) => void;
  onDishQuantityChange?: (
    orderId: string,
    dishId: string,
    quantity: number,
    waiterName?: string | null,
    waiterId?: string | null,
  ) => Promise<void>;
  onOrdersRefresh: () => void;
  availableWaiters?: { id: string; name: string }[];
  waiterSession: { id: string; name: string } | null;
  requireWaiterLogin: (
    onSuccess: (waiter: { id: string; name: string }) => void,
    options?: { forcePicker?: boolean },
  ) => void;
}

function circleClass(
  unit: SpatialUnit,
  active: boolean,
  pulsing: boolean,
): string {
  if (unit.status === "maintenance")
    return "bg-even-evergreen/5 border border-even-evergreen/10 text-even-evergreen/25";
  if (unit.has_tap_pay_account)
    return "bg-even-evergreen border border-even-evergreen text-even-offwhite shadow-[0_0_18px_rgba(2,56,40,0.25)]";
  if (active) {
    const base =
      "bg-even-grass border border-even-grass/60 text-even-evergreen";
    return pulsing
      ? `${base} animate-pulse-ring`
      : `${base} shadow-[0_0_20px_rgba(130,230,87,0.45)]`;
  }
  if (pulsing)
    return "bg-even-grass border border-even-grass/60 text-even-evergreen animate-pulse-ring";
  return "bg-white border border-even-evergreen/15 text-even-evergreen shadow-sm";
}

function SortableCircle({
  unit,
  active,
  pulsing,
  disabled,
  dragDisabled,
  isChecking,
  onClick,
}: {
  unit: SpatialUnit;
  active: boolean;
  pulsing: boolean;
  disabled: boolean;
  dragDisabled: boolean;
  isChecking: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: unit.id, disabled: dragDisabled });

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      disabled={disabled}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-sm cursor-grab active:cursor-grabbing touch-none disabled:cursor-default ${circleClass(unit, active, pulsing)} ${isDragging ? "opacity-75 shadow-lg z-10" : ""}`}
    >
      {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : unit.number}
    </button>
  );
}

export default function SpatialGrid({
  config,
  branchId,
  branches,
  branchesLoading,
  orders,
  onOrdersRefresh,
}: Props) {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  // Distance de activación mínima para el mouse — evita que un click normal
  // (tap corto) se interprete como el inicio de un drag. Touch usa un delay
  // (long-press) en vez de distancia, para no pisarse con el scroll nativo
  // del panel (que es overflow-y-auto).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
  );

  const [units, setUnits] = useState<SpatialUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posUnits, setPosUnits] = useState<Set<string>>(new Set());

  const [checkingUnitId, setCheckingUnitId] = useState<string | null>(null);
  const [confirmUnit, setConfirmUnit] = useState<SpatialUnit | null>(null);
  const [openingAccount, setOpeningAccount] = useState(false);
  const [serviceChoiceUnit, setServiceChoiceUnit] =
    useState<SpatialUnit | null>(null);

  // Evita que el refresco periódico pise un drag en curso — no es un "modo",
  // solo se activa mientras el usuario tiene el dedo/mouse abajo arrastrando.
  const [isReordering, setIsReordering] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

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

        // Tap & Pay y Flex Bill pueden nacer directo en el POS (Soft
        // Restaurant) sin pasar por Even primero — se revisan las mesas
        // libres para detectar esos tickets y ofrecer traerlos.
        if (
          config.orderType === "tap_pay" ||
          config.orderType === "flex_bill"
        ) {
          const freeUnits = data.filter(
            (u) => !u.has_open_account && u.status !== "maintenance",
          );
          if (freeUnits.length > 0) {
            const freeNumbers = new Set(freeUnits.map((u) => u.number));
            peekTablePOSBatch(branchId, token)
              .then((results) => {
                const posSet = new Set<string>();
                for (const r of results) {
                  if (r.hasPOSOrder && freeNumbers.has(r.table_number)) {
                    posSet.add(r.table_number);
                  }
                }
                setPosUnits(posSet);
              })
              .catch(() => {
                // best-effort, igual que antes con Promise.allSettled
              });
          }
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

  // Igual que Kitchen.tsx con Tap & Pay: antes de refrescar, sincroniza
  // platillos agregados directamente en el POS (best-effort) para las
  // órdenes Flex Bill activas — el resto de servicios no lo necesita.
  const handleActualizar = useCallback(
    async (showSpinner = true) => {
      // Mostrar feedback (botón deshabilitado + ícono girando) desde el
      // toque, no hasta que fetchData arranca — si no, la sincronización con
      // POS de abajo (que puede tardar varios segundos si el agente de SR
      // está lento/desconectado) deja el botón sin ningún indicio de que ya
      // se presionó, y se siente como que "no funciona".
      if (showSpinner) setLoading(true);
      if (config.orderType === "flex_bill" && branch) {
        const flexBillOrders = orders.filter(
          (o) => o.orderType === "flex_bill",
        );
        if (flexBillOrders.length > 0) {
          const token = await getToken();
          if (token) {
            await Promise.allSettled(
              flexBillOrders.map((o) => {
                const tableNumber = parseLocationCode(o.identifier);
                if (!tableNumber) return Promise.resolve();
                return syncFlexBillTableFromPOS(
                  branch.restaurant_id,
                  branch.branch_number,
                  tableNumber,
                  token,
                ).catch(() => {});
              }),
            );
          }
        }
      }
      fetchData(showSpinner);
      onOrdersRefresh();
    },
    [config.orderType, branch, orders, getToken, fetchData, onOrdersRefresh],
  );

  // Refresco periódico — mismo patrón que Kitchen.tsx (handleActualizar).
  // No depender solo del socket: si el evento no llega (reconexión, o una
  // orden creada desde otro backend que comparte la misma DB pero no el
  // mismo servidor de sockets), esto igual pone `units`/`orders` al día.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && !loading && !isReordering) {
        handleActualizar(false);
      }
    }, 45_000);
    return () => clearInterval(id);
  }, [handleActualizar, loading, isReordering]);

  // Al volver al frente refresca el croquis; las órdenes las refresca useKitchenOrders
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchData(false);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchData]);

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
    // Mesa libre con ticket pendiente en el POS — aplica a Tap & Pay y Flex
    // Bill por igual, sin importar el pulso de "preparing" de más abajo.
    if (
      !active &&
      (config.orderType === "tap_pay" || config.orderType === "flex_bill") &&
      posUnits.has(unit.number)
    ) {
      return true;
    }
    if (config.pulseKind === "preparing" && active) {
      const order = findOrderForUnit(unit.number);
      return order ? order.dishes.some((d) => d.status === "preparing") : false;
    }
    return false;
  }

  async function handleUnitClick(unit: SpatialUnit) {
    if (reorderMode || unit.status === "maintenance" || checkingUnitId) return;

    if (isUnitActive(unit)) {
      // La cuenta abierta vive en su propia ruta.
      navigate(`/mesas/${encodeURIComponent(unit.number)}`);
      return;
    }

    // Igual que Tap & Pay: si la mesa ya tiene un ticket abierto directo en
    // el POS, se ofrece traerlo a Even antes de dejar abrir una cuenta desde
    // cero — `openTableAccount` decide sola si hace falta preguntar el
    // servicio (needsServiceChoice) según lo que tenga contratado la sucursal.
    if (config.orderType === "tap_pay" || config.orderType === "flex_bill") {
      setCheckingUnitId(unit.id);
      try {
        const token = await getToken();
        if (!token) return;
        const hasPOS =
          posUnits.has(unit.number) ||
          (await peekTablePOS(branchId!, unit.number, token));
        if (hasPOS) {
          setConfirmUnit(unit);
          return;
        }
      } catch {
        // silently fail
      } finally {
        setCheckingUnitId(null);
      }
    }

    if (config.orderType === "flex_bill" && config.freeUnitClickable) {
      navigate(`/mesas/${encodeURIComponent(unit.number)}/comanda`);
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setIsReordering(false);
    if (!over || active.id === over.id || !branchId) return;

    const oldIndex = units.findIndex((u) => u.id === active.id);
    const newIndex = units.findIndex((u) => u.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(units, oldIndex, newIndex);
    setUnits(reordered);

    const token = await getToken();
    if (!token) return;
    try {
      await config.reorderUnits(
        branchId,
        reordered.map((u, index) => ({ id: u.id, display_order: index })),
        token,
      );
    } catch (err) {
      console.error("[SPATIAL-GRID] handleDragEnd error:", err);
      setError(
        `No se pudo guardar el nuevo orden de ${config.pluralLabel.toLowerCase()}.`,
      );
      fetchData(false);
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

  useRegisterRefresh(() => handleActualizar(true), loading);

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col"
      style={{ background: "#023828" }}
    >
      {/* Title + stats */}
      <div className="flex flex-col items-center pb-5 gap-1">
        <h1 className="text-even-offwhite font-medium text-xl uppercase tracking-widest">
          {config.pluralLabel}
        </h1>
        {(branches.length > 0 || (units.length > 0 && !loading)) && (
          <div className="flex items-center gap-2">
            {units.length > 0 && !loading && (
              <button
                onClick={() => setReorderMode((v) => !v)}
                title={reorderMode ? "Listo" : "Mover"}
                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                  reorderMode
                    ? "bg-even-grass text-even-evergreen border-even-grass"
                    : "bg-white/10 hover:bg-white/15 text-even-offwhite/80 border-white/15"
                }`}
              >
                <Move className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        {units.length > 0 && !loading && (
          <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
            {tapPayCount > 0 && (
              <span className="text-[0.6875rem] px-2 py-0.5 rounded uppercase tracking-wider bg-white/15 border border-white/30 text-even-offwhite font-medium">
                {tapPayCount} en cobro
              </span>
            )}
            {activeCount > 0 && (
              <span className="text-[0.6875rem] px-2 py-0.5 rounded uppercase tracking-wider bg-even-grass/20 border border-even-grass/30 text-even-grass font-medium">
                {activeCount}{" "}
                {activeCount === 1 ? "cuenta activa" : "cuentas activas"}
              </span>
            )}
            <span className="text-[0.6875rem] px-2 py-0.5 rounded uppercase tracking-wider bg-white/10 border border-white/15 text-even-offwhite/60 font-medium">
              {availableCount} {availableCount === 1 ? "libre" : "libres"}
            </span>
          </div>
        )}
      </div>

      {/* Glass panel — croquis */}
      <div
        className="flex-1 rounded-t-lg px-6 py-6 flex flex-col min-h-0 overflow-y-auto text-even-evergreen"
        style={{ background: "#FEFEEB" }}
      >
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
            <p className="text-rose-600 text-center mt-10 text-sm">{error}</p>
          )}

          {branchId && !loading && !error && units.length === 0 && (
            <p className="text-even-evergreen/50 text-center mt-10 text-sm">
              No hay {config.pluralLabel.toLowerCase()} registradas para esta
              sucursal.
            </p>
          )}

          {branchId && !loading && !error && units.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => setIsReordering(true)}
              onDragCancel={() => setIsReordering(false)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={units.map((u) => u.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-4 gap-4 justify-items-center">
                  {units.map((unit) => {
                    const active = isUnitActive(unit);
                    return (
                      <SortableCircle
                        key={unit.id}
                        unit={unit}
                        active={active}
                        pulsing={isPulsing(unit, active)}
                        dragDisabled={!reorderMode}
                        disabled={
                          reorderMode ||
                          unit.status === "maintenance" ||
                          !!checkingUnitId
                        }
                        isChecking={checkingUnitId === unit.id}
                        onClick={() => handleUnitClick(unit)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      </div>

      {/* Confirmación traer cuenta — hay un ticket abierto directo en el POS
          que Even todavía no conoce (Tap & Pay o Flex Bill). */}
      {confirmUnit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-white/10 shadow-2xl px-6 py-6 flex flex-col gap-5"
            style={{ background: "#023828" }}
          >
            <div>
              <p className="text-even-offwhite/40 text-xs uppercase tracking-widest mb-1">
                {config.unitLabel} {confirmUnit.number}
              </p>
              <h2 className="text-even-offwhite font-bold text-xl">
                {config.orderType === "tap_pay"
                  ? "¿Liquidar cuenta?"
                  : "¿Traer cuenta a Even?"}
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
                {config.orderType === "tap_pay"
                  ? "Liquidar cuenta"
                  : "Traer cuenta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Elegir servicio (cliente tiene Tap & Pay y Flex Bill contratados) */}
      {serviceChoiceUnit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-white/10 shadow-2xl px-6 py-6 flex flex-col gap-5"
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
    </div>
  );
}

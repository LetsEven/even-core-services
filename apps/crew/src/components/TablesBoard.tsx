import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
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
import { Loader2, ShoppingBag } from "lucide-react";
import {
  getRoomsForBranch,
  getTablesForBranch,
  openTableAccount,
  peekTablePOS,
  peekTablePOSBatch,
  reorderRooms,
  reorderTables,
  syncFlexBillTableFromPOS,
  type Branch,
} from "../services/api";
import { Modal } from "@even/ui";
import type { CookingStatus, Order, OrderType } from "../types";
import { getOrderProgress, type OrderProgress } from "../features/cocina/board";
import { parseLocationCode } from "../utils/identifier";
import { useRegisterRefresh } from "../app/refresh";
import {
  resolveOpenService,
  type CrewConfig,
} from "../features/config/crewConfig";
import {
  SERVICE_META,
  findUnitOrder,
  getUnitService,
  getUnitState,
  type UnitState,
} from "../features/mesas/serviceMeta";

// Tablero único de Mesas (y habitaciones): muestra TODAS las unidades juntas.
// El color indica el estado; un puntito con inicial, el servicio de origen de
// la cuenta. El servicio no es un filtro ni una pantalla.

export interface BoardUnit {
  id: string;
  number: string;
  kind: "table" | "room";
  status: "available" | "occupied" | "maintenance";
  has_open_account: boolean;
  has_tap_pay_account?: boolean;
}

interface Props {
  branchId: string | null;
  branches: Branch[];
  branchesLoading: boolean;
  orders: Order[];
  activeOrderTypes: OrderType[];
  crewConfig: CrewConfig;
  onOrdersRefresh: () => void;
  /** Marca el estado de un pedido Pick & Go (se usa para "Entregar"). */
  onPickAndGoStatusChange?: (orderId: string, status: CookingStatus) => void;
  /** Solo lectura: Pick & Go se ve pero no se puede entregar. */
  pickAndGoReadOnly?: boolean;
}

const STATE_CLASS: Record<UnitState, string> = {
  maintenance:
    "bg-even-evergreen/5 border border-even-evergreen/10 text-even-evergreen/25",
  cobro:
    "bg-even-grass border border-even-grass/60 text-even-evergreen shadow-[0_0_20px_rgba(130,230,87,0.45)]",
  ocupada:
    "bg-even-grass border border-even-grass/60 text-even-evergreen shadow-[0_0_20px_rgba(130,230,87,0.45)]",
  libre:
    "bg-white border border-even-evergreen/15 text-even-evergreen shadow-sm",
};

function SortableCircle({
  unit,
  state,
  service,
  pulsing,
  progress,
  disabled,
  dragDisabled,
  isChecking,
  onClick,
}: {
  unit: BoardUnit;
  state: UnitState;
  service: OrderType | null;
  pulsing: boolean;
  progress: OrderProgress | null;
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
  const meta = service ? SERVICE_META[service] : null;
  const label = `${unit.kind === "room" ? "Habitación" : "Mesa"} ${unit.number}${
    meta ? `, ${meta.label}` : ""
  }${
    progress?.complete
      ? ", pedido completo por entregar"
      : progress?.partial
        ? `, ${progress.ready} de ${progress.pending} platillos listos`
        : ""
  }`;

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative w-14 h-14 rounded-full flex items-center justify-center font-bold text-sm disabled:cursor-default ${
        dragDisabled
          ? "cursor-pointer"
          : "cursor-grab active:cursor-grabbing touch-none"
      } ${STATE_CLASS[state]} ${pulsing ? "animate-pulse-ring" : ""} ${
        isDragging ? "opacity-75 shadow-lg z-10" : ""
      }`}
    >
      {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : unit.number}
    </button>
  );
}

export default function TablesBoard({
  branchId,
  branches,
  branchesLoading,
  orders,
  activeOrderTypes,
  crewConfig,
  onOrdersRefresh,
  onPickAndGoStatusChange,
  pickAndGoReadOnly = false,
}: Props) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
  );

  const [units, setUnits] = useState<BoardUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posUnits, setPosUnits] = useState<Set<string>>(new Set());
  const [checkingUnitId, setCheckingUnitId] = useState<string | null>(null);
  const [confirmUnit, setConfirmUnit] = useState<BoardUnit | null>(null);
  const [openingAccount, setOpeningAccount] = useState(false);
  const [serviceChoiceUnit, setServiceChoiceUnit] = useState<BoardUnit | null>(
    null,
  );
  const [isReordering, setIsReordering] = useState(false);
  const reorderMode = false;
  const [showPickAndGo, setShowPickAndGo] = useState(false);

  const branch = branches.find((b) => b.id === branchId) ?? null;
  const hasRooms = activeOrderTypes.includes("room");
  const hasTapPay = activeOrderTypes.includes("tap_pay");
  const hasFlexBill = activeOrderTypes.includes("flex_bill");
  const hasPosServices = hasTapPay || hasFlexBill;
  const openService = resolveOpenService(crewConfig, activeOrderTypes);

  const fetchData = useCallback(
    async (showSpinner = true) => {
      if (!branchId) return;
      if (showSpinner) setLoading(true);
      setError(null);
      setPosUnits(new Set());
      try {
        const token = await getToken();
        if (!token) return;
        const [tables, rooms] = await Promise.all([
          getTablesForBranch(branchId, token),
          hasRooms ? getRoomsForBranch(branchId, token) : Promise.resolve([]),
        ]);
        const data: BoardUnit[] = [
          ...tables.map((t) => ({
            id: t.id,
            number: t.table_number,
            kind: "table" as const,
            status: t.status,
            has_open_account: t.has_open_account,
            has_tap_pay_account: t.has_tap_pay_account,
          })),
          ...rooms.map((r) => ({
            id: r.id,
            number: r.room_number,
            kind: "room" as const,
            status: r.status,
            has_open_account: r.has_open_account,
          })),
        ];
        setUnits(data);

        // Tap & Pay y Flex Bill pueden nacer directo en el POS: se revisan las
        // mesas libres para ofrecer traer esa cuenta.
        if (hasPosServices) {
          const free = data.filter(
            (u) =>
              u.kind === "table" &&
              !u.has_open_account &&
              u.status !== "maintenance",
          );
          if (free.length > 0) {
            const freeNumbers = new Set(free.map((u) => u.number));
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
              .catch(() => {});
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error al cargar las mesas");
      } finally {
        setLoading(false);
      }
    },
    [getToken, branchId, hasRooms, hasPosServices],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleActualizar = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      if (hasFlexBill && branch) {
        const flex = orders.filter((o) => o.orderType === "flex_bill");
        if (flex.length > 0) {
          const token = await getToken();
          if (token) {
            await Promise.allSettled(
              flex.map((o) => {
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
    [hasFlexBill, branch, orders, getToken, fetchData, onOrdersRefresh],
  );

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && !loading && !isReordering) {
        handleActualizar(false);
      }
    }, 45_000);
    return () => clearInterval(id);
  }, [handleActualizar, loading, isReordering]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchData(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchData]);

  // Estado derivado de cada unidad, cruzando TODAS las órdenes activas.
  const view = useMemo(
    () =>
      units.map((unit) => {
        const order = findUnitOrder(orders, unit.number, unit.kind);
        const hasTapPayAccount = !!unit.has_tap_pay_account;
        const state = getUnitState(
          unit.status,
          hasTapPayAccount,
          order,
          unit.has_open_account,
        );
        const service = getUnitService(order, hasTapPayAccount, unit.kind);
        const progress = order ? getOrderProgress(order) : null;
        // Pide al mesero: pidieron la cuenta, o hay platillos listos por entregar.
        const pulsing = state === "cobro" || (progress?.ready ?? 0) > 0;
        return { unit, state, service, pulsing, progress };
      }),
    [units, orders],
  );

  async function handleUnitClick(unit: BoardUnit, state: UnitState) {
    if (reorderMode || unit.status === "maintenance" || checkingUnitId) return;

    if (state === "ocupada" || state === "cobro") {
      navigate(`/mesas/${encodeURIComponent(unit.number)}`);
      return;
    }
    // Habitaciones libres: la cuenta la abre el huésped.
    if (unit.kind === "room") return;

    if (hasPosServices) {
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
        // best-effort
      } finally {
        setCheckingUnitId(null);
      }
    }

    // Mesa libre: va a la cuenta ("Abrir cuenta") en vez de saltar al menú.
    // La comanda desde Crew nace como Flex Bill. Tap & Pay y el modo POS Even
    // sin servicio contratado no abren cuenta desde aquí todavía.
    if (hasFlexBill && openService !== "tap_pay") {
      navigate(`/mesas/${encodeURIComponent(unit.number)}`);
    }
  }

  async function handleConfirmOpen(service?: "tap_pay" | "flex_bill") {
    const unit = confirmUnit ?? serviceChoiceUnit;
    if (!branchId || !unit) return;
    setOpeningAccount(true);
    try {
      const token = await getToken();
      if (!token) return;
      const chosen =
        service ??
        (openService === "tap_pay" || openService === "flex_bill"
          ? openService
          : undefined);
      const result = await openTableAccount(
        branchId,
        unit.number,
        token,
        chosen,
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
      console.error("[TABLES-BOARD] handleConfirmOpen error:", err);
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
      const toOrder = (kind: BoardUnit["kind"]) =>
        reordered
          .filter((u) => u.kind === kind)
          .map((u, index) => ({ id: u.id, display_order: index }));
      await reorderTables(branchId, toOrder("table"), token);
      if (hasRooms) await reorderRooms(branchId, toOrder("room"), token);
    } catch (err) {
      console.error("[TABLES-BOARD] handleDragEnd error:", err);
      setError("No se pudo guardar el nuevo orden.");
      fetchData(false);
    }
  }

  const hasPickAndGo = activeOrderTypes.includes("pick_and_go");
  const pickAndGo = useMemo(() => {
    const list = orders
      .filter((o) => o.orderType === "pick_and_go")
      .map((order) => ({ order, progress: getOrderProgress(order) }))
      .filter(({ progress }) => progress.pending > 0)
      .sort(
        (a, b) =>
          new Date(a.order.createdAt).getTime() -
          new Date(b.order.createdAt).getTime(),
      );
    return {
      complete: list.filter((x) => x.progress.complete),
      inKitchen: list.filter((x) => !x.progress.complete),
    };
  }, [orders]);

  const cobroCount = view.filter((v) => v.state === "cobro").length;
  const activeCount = orders.filter(
    (o) => o.orderType !== "pick_and_go",
  ).length;
  const freeCount = view.filter((v) => v.state === "libre").length;

  useRegisterRefresh(() => handleActualizar(true), loading);

  const onlyTapPay = openService === "tap_pay";

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col"
      style={{ background: "#023828" }}
    >
      <div className="flex flex-col items-center pb-5 gap-1">
        <h1 className="text-even-offwhite font-medium text-xl uppercase tracking-widest">
          Mesas
        </h1>
        {((units.length > 0 && !loading) || hasPickAndGo) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
            {hasPickAndGo && (
              <button
                type="button"
                onClick={() => setShowPickAndGo(true)}
                aria-label={`Pick & Go, ${pickAndGo.complete.length} pedidos completos`}
                className="relative flex min-h-7 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 text-[0.6875rem] font-medium uppercase tracking-wider text-even-offwhite/80 transition-colors hover:bg-white/15 cursor-pointer"
              >
                <ShoppingBag className="w-3 h-3" />
                Pick &amp; Go
                {pickAndGo.complete.length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-even-grass px-1 text-[0.6875rem] font-semibold text-even-evergreen">
                    {pickAndGo.complete.length}
                  </span>
                )}
              </button>
            )}
            {units.length > 0 && !loading && (
              <>
                {cobroCount > 0 && (
                  <span className="text-[0.6875rem] px-2 py-0.5 rounded uppercase tracking-wider bg-white/15 border border-white/30 text-even-offwhite font-medium">
                    {cobroCount} en cobro
                  </span>
                )}
                {activeCount > 0 && (
                  <span className="text-[0.6875rem] px-2 py-0.5 rounded uppercase tracking-wider bg-even-grass/20 border border-even-grass/30 text-even-grass font-medium">
                    {activeCount}{" "}
                    {activeCount === 1 ? "cuenta activa" : "cuentas activas"}
                  </span>
                )}
                <span className="text-[0.6875rem] px-2 py-0.5 rounded uppercase tracking-wider bg-white/10 border border-white/15 text-even-offwhite/60 font-medium">
                  {freeCount} {freeCount === 1 ? "libre" : "libres"}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div
        className="flex-1 rounded-t-lg px-6 py-6 flex flex-col min-h-0 overflow-y-auto text-even-evergreen"
        style={{ background: "#FEFEEB" }}
      >
        {!branchId && (
          <p className="text-even-evergreen/50 text-center mt-10">
            Selecciona una sucursal para ver las mesas.
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
            No hay mesas registradas para esta sucursal.
          </p>
        )}
        {branchId && !loading && !error && units.length > 0 && (
          <>
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
                  {view.map(({ unit, state, service, pulsing, progress }) => (
                    <SortableCircle
                      key={unit.id}
                      unit={unit}
                      state={state}
                      service={service}
                      pulsing={pulsing}
                      progress={progress}
                      dragDisabled={!reorderMode}
                      disabled={
                        reorderMode ||
                        unit.status === "maintenance" ||
                        !!checkingUnitId
                      }
                      isChecking={checkingUnitId === unit.id}
                      onClick={() => handleUnitClick(unit, state)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>

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
                Mesa {confirmUnit.number}
              </p>
              <h2 className="text-even-offwhite font-bold text-xl">
                {onlyTapPay ? "¿Liquidar cuenta?" : "¿Traer cuenta a Even?"}
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
                {onlyTapPay ? "Liquidar cuenta" : "Traer cuenta"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                Mesa {serviceChoiceUnit.number}
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
      <Modal
        open={showPickAndGo}
        onClose={() => setShowPickAndGo(false)}
        aria-label="Pick & Go"
      >
        <div className="flex flex-col gap-4 p-5 text-even-evergreen">
          <h2 className="text-lg font-semibold">Pick &amp; Go</h2>
          <section
            aria-label="Listos para entregar"
            className="flex flex-col gap-2"
          >
            <h3 className="text-xs font-semibold uppercase tracking-widest text-even-evergreen/60">
              Completos, por entregar ({pickAndGo.complete.length})
            </h3>
            {pickAndGo.complete.length === 0 && (
              <p className="text-sm text-even-evergreen/50">
                Ningún pedido completo por ahora.
              </p>
            )}
            {pickAndGo.complete.map(({ order }) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-even-grass/60 bg-even-grass/15 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {order.customerName || order.identifier}
                  </p>
                  <p className="truncate text-xs text-even-evergreen/60">
                    {order.dishes
                      .filter((d) => d.status === "ready")
                      .map((d) => `${d.quantity}× ${d.item}`)
                      .join(", ")}
                  </p>
                </div>
                {!pickAndGoReadOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      onPickAndGoStatusChange?.(order.id, "delivered")
                    }
                    className="min-h-11 shrink-0 cursor-pointer rounded-full bg-even-grass px-4 text-sm font-medium text-even-evergreen active:scale-95"
                  >
                    Entregar
                  </button>
                )}
              </div>
            ))}
          </section>
          <section aria-label="En cocina" className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-even-evergreen/60">
              En cocina ({pickAndGo.inKitchen.length})
            </h3>
            {pickAndGo.inKitchen.length === 0 && (
              <p className="text-sm text-even-evergreen/50">
                Nada en preparación.
              </p>
            )}
            {pickAndGo.inKitchen.map(({ order, progress }) => (
              <div
                key={order.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-stroke-soft bg-white p-3"
              >
                <p className="min-w-0 truncate font-medium">
                  {order.customerName || order.identifier}
                </p>
                <span className="shrink-0 text-xs text-even-evergreen/60">
                  {progress.ready} de {progress.pending} listos
                </span>
              </div>
            ))}
          </section>
        </div>
      </Modal>
    </div>
  );
}

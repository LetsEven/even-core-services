import { useState, useEffect, useRef, Fragment } from "react";
import { Banknote, Loader2, Plus, Printer, User } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import type { Order, DishStatus, CookingStatus } from "../types";
import type { Branch, QRCodeRow } from "../services/api";
import { getQRCodesForBranch, updateOrderWaiter } from "../services/api";
import DishItem from "./DishItem";
import CashPaymentModal from "./CashPaymentModal";
import AddDishModal from "./AddDishModal";
import PrintTicketModal from "./PrintTicketModal";
import ContactCustomerModal from "./ContactCustomerModal";
import { formatFolio } from "../utils/folio";
import { parseLocationCode } from "../utils/identifier";

const ORDER_TYPE_LABELS: Record<string, string> = {
  tap: "Tap Order & Pay",
  pick_and_go: "Pick & Go",
  room: "Room Service",
  tap_pay: "Tap & Pay",
  flex_bill: "Flex Bill",
};

const ORDER_TYPE_COLORS: Record<string, string> = {
  tap: "bg-blue-500/15 text-blue-700",
  pick_and_go: "bg-orange-500/15 text-orange-700",
  room: "bg-pink-500/15 text-pink-700",
  tap_pay: "bg-cyan-500/15 text-cyan-700",
  flex_bill: "bg-purple-500/15 text-purple-700",
};

const COOKING_STATUS_LABELS: Record<CookingStatus, string> = {
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Entregado",
};

const COOKING_STATUS_BADGE: Record<CookingStatus, string> = {
  preparing: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  ready: "bg-teal-500/15 text-teal-700 border-teal-500/40",
  delivered: "bg-even-grass/25 text-even-evergreen border-even-grass/50",
};

const COOKING_BUTTON_ACTIVE: Record<CookingStatus, string> = {
  preparing: "bg-amber-500 text-even-offwhite border-amber-500",
  ready: "bg-teal-500 text-even-offwhite border-teal-500",
  delivered: "bg-even-grass text-even-evergreen border-even-grass",
};

const COOKING_STATUSES: CookingStatus[] = ["preparing", "ready", "delivered"];

interface OrderCardProps {
  order: Order;
  onDishStatusChange: (dishId: string, status: DishStatus) => void;
  onDishQuantityChange?: (
    orderId: string,
    dishId: string,
    quantity: number,
  ) => Promise<void>;
  onOrderCookingStatusChange?: (orderId: string, status: CookingStatus) => void;
  onPrepTimeExtraChange?: (orderId: string, extraMinutes: number) => void;
  currentBranch?: Branch | null;
  onPaymentRegistered?: () => void;
  availableWaiters?: { id: string; name: string }[];
  waiterSession?: { id: string; name: string } | null;
  requireWaiterLogin?: (
    onSuccess: (waiter: { id: string; name: string }) => void,
    options?: { forcePicker?: boolean },
  ) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeOnly(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function paymentTypeLabel(cardType: string | null): string {
  if (cardType === "cash") return "Efectivo";
  if (cardType === "terminal") return "Terminal";
  if (
    cardType === "debit" ||
    cardType === "credit" ||
    cardType === "digital_wallet"
  )
    return "Digital";
  return "—";
}

export default function OrderCard({
  order,
  onDishStatusChange,
  onDishQuantityChange,
  onOrderCookingStatusChange,
  onPrepTimeExtraChange,
  currentBranch,
  onPaymentRegistered,
  availableWaiters = [{ id: "EVEN", name: "EVEN" }],
  waiterSession = null,
  requireWaiterLogin = (onSuccess) => onSuccess({ id: "EVEN", name: "EVEN" }),
}: OrderCardProps) {
  const isPickAndGo = order.orderType === "pick_and_go";
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isPickAndGo || order.cookingStatus !== "preparing") return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isPickAndGo, order.cookingStatus]);
  const delivered = order.dishes.filter((d) => d.status === "delivered").length;
  const total = order.dishes.length;
  const currentCookingStatus = order.cookingStatus ?? "preparing";
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddDish, setShowAddDish] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [ticketQR, setTicketQR] = useState<QRCodeRow | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [localWaiterName, setLocalWaiterName] = useState(
    order.waiterName ?? "EVEN",
  );
  const [localWaiterId, setLocalWaiterId] = useState(order.waiterId);

  const [prepTimePickerOpen, setPrepTimePickerOpen] = useState(false);
  const [prepTimeDropdownPos, setPrepTimeDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [prepTimeInputValue, setPrepTimeInputValue] = useState(
    order.waiterExtraMinutes ?? 0,
  );
  const prepTimePickerRef = useRef<HTMLDivElement>(null);
  const prepTimeBtnRef = useRef<HTMLButtonElement>(null);

  const { getToken } = useAuth();

  // La orden queda "reclamada" (waiter_name distinto de EVEN) una sola vez —
  // a partir de ahí, solo el mesero de la sesión actual del dispositivo (si
  // coincide) puede deshacerla. Nadie más la puede tocar.
  const hasRealWaiters = availableWaiters.some((w) => w.id !== "EVEN");
  const isEven = localWaiterName == null || localWaiterName === "EVEN";
  const isMine =
    !isEven &&
    waiterSession != null &&
    (localWaiterId
      ? // waiter_id en la orden viene de la DB (varchar(50), siempre
        // string); waiterSession.id viene tal cual del listado de meseros
        // de Soft Restaurant, que puede traer el id como número — sin
        // String() acá, "5" === 5 da false y "Desasignar" nunca aparece.
        String(localWaiterId) === String(waiterSession.id)
      : localWaiterName === waiterSession.name);

  useEffect(() => {
    setLocalWaiterName(order.waiterName ?? "EVEN");
    setLocalWaiterId(order.waiterId);
  }, [order.waiterName, order.waiterId]);

  useEffect(() => {
    setPrepTimeInputValue(order.waiterExtraMinutes ?? 0);
  }, [order.waiterExtraMinutes]);

  const handleTogglePrepTimePicker = () => {
    if (!prepTimePickerOpen && prepTimeBtnRef.current) {
      const rect = prepTimeBtnRef.current.getBoundingClientRect();
      const popoverWidth = 220;
      const left = Math.min(rect.left, window.innerWidth - popoverWidth - 12);
      setPrepTimeDropdownPos({
        top: rect.bottom + 4,
        left: Math.max(12, left),
      });
    }
    setPrepTimeInputValue(order.waiterExtraMinutes ?? 0);
    setPrepTimePickerOpen((v) => !v);
  };

  useEffect(() => {
    if (!prepTimePickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        prepTimePickerRef.current &&
        !prepTimePickerRef.current.contains(e.target as Node)
      ) {
        setPrepTimePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [prepTimePickerOpen]);

  const handleSavePrepTimeExtra = () => {
    setPrepTimePickerOpen(false);
    onPrepTimeExtraChange?.(order.id, prepTimeInputValue);
  };

  const handleClaim = () => {
    requireWaiterLogin(
      async (waiter) => {
        setLocalWaiterName(waiter.name);
        setLocalWaiterId(waiter.id);
        try {
          const token = await getToken();
          if (!token) return;
          await updateOrderWaiter(
            order.id,
            order.orderType,
            waiter.name,
            waiter.id,
            token,
          );
        } catch {
          setLocalWaiterName(order.waiterName ?? "EVEN");
          setLocalWaiterId(order.waiterId);
        }
      },
      // Siempre muestra la lista de meseros al reclamar, en vez de asumir
      // que es quien esté logueado en el dispositivo — puede estar
      // compartido entre varios meseros.
      { forcePicker: true },
    );
  };

  const handleUndo = async () => {
    setLocalWaiterName("EVEN");
    setLocalWaiterId(undefined);
    try {
      const token = await getToken();
      if (!token) return;
      await updateOrderWaiter(
        order.id,
        order.orderType,
        "EVEN",
        undefined,
        token,
      );
    } catch {
      setLocalWaiterName(order.waiterName ?? "EVEN");
      setLocalWaiterId(order.waiterId);
    }
  };

  const canAddDish =
    order.orderType === "flex_bill" &&
    currentBranch != null &&
    order.status !== "paid";
  // Eliminar/reducir un platillo solo lo puede hacer el mesero asignado a
  // la mesa (isMine) — si nadie la reclamó todavía (isEven), cualquiera
  // puede, igual que con "Desasignar" arriba.
  const canEditDishes = canAddDish && (isEven || isMine);
  const canRegisterPayment =
    (order.orderType === "flex_bill" || order.orderType === "tap_pay") &&
    (order.remainingAmount ?? 0) > 0 &&
    currentBranch != null;
  const canPrintTicket =
    order.orderType === "tap_pay" &&
    currentBranch != null &&
    (currentBranch.tap_pay_print ?? true);

  const handlePrint = async () => {
    if (!currentBranch) return;
    setLoadingTicket(true);
    const tableCode = parseLocationCode(order.identifier);
    try {
      const token = await getToken();
      if (token) {
        const qrCodes = await getQRCodesForBranch(currentBranch.id, token);
        setTicketQR(qrCodes.find((q) => q.table_number === tableCode) ?? null);
      } else {
        setTicketQR(null);
      }
    } catch {
      setTicketQR(null);
    }
    setLoadingTicket(false);
    setPrintModalOpen(true);
  };

  return (
    <div
      className="rounded-lg overflow-hidden border border-even-evergreen/20 shadow-sm"
      style={{ background: "#FFFFFF" }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-even-evergreen/10">
        <div className="flex items-center justify-between mb-2">
          <span
            className={`text-[11px] px-2 py-0.5 rounded font-medium uppercase tracking-wider ${ORDER_TYPE_COLORS[order.orderType] ?? "bg-even-evergreen/10 text-even-evergreen/70"}`}
          >
            {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
          </span>
          <span className="text-xs text-even-evergreen/40">
            {formatTime(order.createdAt)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-even-evergreen min-w-0 truncate">
            {order.identifier}
          </h2>
          {order.folio != null && order.folio !== "" && (
            <span className="shrink-0 text-sm font-mono font-semibold px-2 py-0.5 rounded bg-even-evergreen/10 text-even-evergreen/60">
              #{formatFolio(order.folio)}
            </span>
          )}
        </div>
        {(order.customerName || order.customerPhone) && (
          <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
            {order.customerName && (
              <span className="text-base text-even-evergreen/80">
                {order.customerName}
              </span>
            )}
            {order.customerPhone && (
              <button
                onClick={() => setContactModalOpen(true)}
                className="flex items-center gap-1 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-even-grass/20 border border-even-grass/45 text-even-evergreen hover:bg-even-grass/30 transition-colors cursor-pointer"
              >
                Contactar
              </button>
            )}
          </div>
        )}
        {isPickAndGo ? (
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span
              className={`text-[11px] px-2 py-0.5 rounded border font-medium uppercase tracking-wider ${COOKING_STATUS_BADGE[currentCookingStatus]}`}
            >
              {COOKING_STATUS_LABELS[currentCookingStatus]}
            </span>
            {currentCookingStatus === "preparing" &&
              order.prepTimeMinutes != null &&
              (() => {
                const waiterExtra = order.waiterExtraMinutes ?? 0;
                const originalDeadline =
                  new Date(order.createdAt).getTime() +
                  (order.prepTimeMinutes! + waiterExtra) * 60_000;
                const extensions =
                  now > originalDeadline
                    ? Math.ceil((now - originalDeadline) / (5 * 60_000))
                    : 0;
                const deadline = new Date(
                  originalDeadline + extensions * 5 * 60_000,
                );
                const h = String(deadline.getHours()).padStart(2, "0");
                const m = String(deadline.getMinutes()).padStart(2, "0");
                return (
                  <>
                    <span className="text-[11px] px-2 py-0.5 rounded border bg-even-grass/20 border-even-grass/45 text-even-evergreen uppercase tracking-wider">
                      Hora estimada {h}:{m}
                    </span>
                    <button
                      ref={prepTimeBtnRef}
                      type="button"
                      onClick={handleTogglePrepTimePicker}
                      className="px-1.5 py-0.5 rounded border bg-even-grass/20 border-even-grass/45 text-even-evergreen hover:bg-even-grass/30 transition-colors cursor-pointer"
                      aria-label="Editar minutos extra"
                    >
                      <Plus className="w-3 h-3" strokeWidth={2.5} />
                    </button>
                    {prepTimePickerOpen && prepTimeDropdownPos && (
                      <div
                        ref={prepTimePickerRef}
                        className="fixed z-9999 min-w-50 bg-white border border-even-evergreen/15 rounded-lg shadow-xl p-3"
                        style={{
                          top: prepTimeDropdownPos.top,
                          left: prepTimeDropdownPos.left,
                        }}
                      >
                        <p className="text-[11px] uppercase tracking-wider text-even-evergreen/60 mb-2">
                          Minutos extra
                        </p>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={prepTimeInputValue}
                          onChange={(e) =>
                            setPrepTimeInputValue(
                              Math.min(
                                60,
                                Math.max(0, parseInt(e.target.value, 10) || 0),
                              ),
                            )
                          }
                          className="w-full border border-even-evergreen/20 rounded-md px-2 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-even-grass"
                        />
                        <div className="flex gap-1.5 mb-2">
                          {[5, 10, 15].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() =>
                                setPrepTimeInputValue((v) =>
                                  Math.min(60, v + mins),
                                )
                              }
                              className="flex-1 text-[11px] font-medium px-2 py-1 rounded-md bg-even-evergreen/5 hover:bg-even-evergreen/10 text-even-evergreen/70 transition-colors cursor-pointer"
                            >
                              +{mins}
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-even-evergreen/60 text-center mb-3">
                          {order.prepTimeMinutes} + {prepTimeInputValue} ={" "}
                          {order.prepTimeMinutes! + prepTimeInputValue} min
                        </p>
                        <button
                          type="button"
                          onClick={handleSavePrepTimeExtra}
                          className="w-full text-xs font-medium px-2 py-1.5 rounded-md bg-even-grass text-even-evergreen hover:bg-even-grass/90 transition-colors cursor-pointer"
                        >
                          Guardar
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
          </div>
        ) : order.orderType !== "tap_pay" ? (
          <p className="text-sm text-even-evergreen/50 mt-0.5">
            {delivered}/{total} entregados
          </p>
        ) : null}
        {order.orderNotes && (
          <p className="text-sm text-even-evergreen/80 mt-1.5">
            Comentarios: {order.orderNotes}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          {isEven && hasRealWaiters ? (
            <button
              onClick={handleClaim}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-even-grass/20 border border-even-grass/45 text-even-evergreen hover:bg-even-grass/30 transition-colors cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{localWaiterName}</span>
              <span className="text-[10px] uppercase tracking-wider text-even-evergreen/60">
                · Asignarme
              </span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-even-evergreen/10 border border-even-evergreen/20 text-even-evergreen/70 w-fit">
              <User className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{localWaiterName}</span>
            </span>
          )}
          {isMine && (
            <button
              onClick={handleUndo}
              className="text-[11px] uppercase tracking-wider text-even-evergreen/50 hover:text-even-evergreen underline underline-offset-2 cursor-pointer"
            >
              Desasignar
            </button>
          )}
        </div>
      </div>

      {/* Dishes */}
      <div className="px-5 py-4 flex flex-col gap-4">
        {order.dishes.map((dish) => (
          <DishItem
            key={dish.id}
            dish={dish}
            onStatusChange={onDishStatusChange}
            hideStatusButtons={isPickAndGo || order.orderType === "tap_pay"}
            hideStatusBadge={order.orderType === "flex_bill"}
            onQuantityChange={
              canEditDishes && onDishQuantityChange
                ? (dishId, quantity) =>
                    onDishQuantityChange(order.id, dishId, quantity)
                : undefined
            }
          />
        ))}
      </div>

      {/* Order-level cooking status buttons for Pick & Go */}
      {isPickAndGo && (
        <div className="px-5 pb-5 pt-2 border-t border-even-evergreen/10">
          <div className="flex gap-2">
            {COOKING_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => onOrderCookingStatusChange?.(order.id, s)}
                disabled={currentCookingStatus === s}
                className={`flex-1 py-1.5 text-xs rounded-md font-medium uppercase tracking-wider border transition-all active:scale-95 cursor-pointer disabled:cursor-default ${
                  currentCookingStatus === s
                    ? COOKING_BUTTON_ACTIVE[s]
                    : "bg-transparent text-even-evergreen/50 border-even-evergreen/20 hover:border-even-evergreen/40"
                }`}
              >
                {COOKING_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pagos flex_bill / tap_pay */}
      {(order.orderType === "flex_bill" || order.orderType === "tap_pay") &&
        (order.totalAmount != null ||
          order.paidAmount != null ||
          (order.payments?.length ?? 0) > 0 ||
          canRegisterPayment ||
          canAddDish ||
          canPrintTicket) && (
          <div className="px-5 pb-5 pt-2 border-t border-even-evergreen/10 flex flex-col gap-2">
            {(order.totalAmount != null || order.paidAmount != null) && (
              <div className="flex gap-3">
                <div className="flex flex-col items-center flex-1">
                  <span className="text-[10px] uppercase tracking-widest text-even-evergreen/60">
                    Total
                  </span>
                  <span className="text-sm font-semibold text-even-evergreen">
                    $
                    {(
                      order.totalDisplayAmount ??
                      order.totalAmount ??
                      0
                    ).toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-col items-center flex-1">
                  <span className="text-[10px] uppercase tracking-widest text-even-evergreen/60">
                    Pagado
                  </span>
                  <span className="text-sm font-semibold text-even-evergreen">
                    $
                    {(order.paidDisplayAmount ?? order.paidAmount ?? 0).toFixed(
                      2,
                    )}
                  </span>
                </div>
                <div className="flex flex-col items-center flex-1">
                  <span className="text-[10px] uppercase tracking-widest text-even-evergreen/60">
                    Restante
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      (order.remainingAmount ?? 0) > 0
                        ? "text-amber-600"
                        : "text-even-evergreen"
                    }`}
                  >
                    $
                    {(
                      order.remainingDisplayAmount ??
                      order.remainingAmount ??
                      0
                    ).toFixed(2)}
                  </span>
                </div>
                {/* Comentado por ahora — ver conversación sobre Pagado + propina
                <div className="flex flex-col items-center flex-1">
                  <span className="text-[10px] uppercase tracking-widest text-even-evergreen/60">
                    Pagado + propina
                  </span>
                  <span className="text-sm font-semibold text-even-evergreen">
                    $
                    {(
                      (order.totalDisplayAmount ?? order.totalAmount ?? 0) +
                      (order.payments ?? []).reduce(
                        (sum, p) => sum + (p.tipAmount ?? 0),
                        0,
                      )
                    ).toFixed(2)}
                  </span>
                </div>
                */}
              </div>
            )}
            {(order.payments?.length ?? 0) > 0 && (
              <div className="border-t border-even-evergreen/10 pt-2 grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center">
                <span className="text-[10px] uppercase tracking-wider text-even-evergreen/50 font-medium pb-1">
                  Hora
                </span>
                <span className="text-[10px] uppercase tracking-wider text-even-evergreen/50 font-medium pb-1">
                  Quién
                </span>
                <span className="text-[10px] uppercase tracking-wider text-even-evergreen/50 font-medium pb-1">
                  Tipo
                </span>
                <span className="text-[10px] uppercase tracking-wider text-even-evergreen/50 font-medium text-right pb-1">
                  Monto
                </span>
                <span className="text-[10px] uppercase tracking-wider text-even-evergreen/50 font-medium text-right pb-1">
                  Prop
                </span>
                {order.payments!.map((p) => {
                  // Para flex_bill, tip_amount es el valor "crudo" que se
                  // resuelve hacia atrás (resolveTipAmountForTargetDisplay)
                  // para que la propina mostrada al mesero cierre exacta —
                  // no es la propina que el cliente ve. La comisión se
                  // cobra con una tasa combinada sobre base+tip, así que se
                  // reparte proporcional entre ambos para desglosar Monto/Prop.
                  const flexMonto =
                    p.baseAmount + p.tipAmount > 0
                      ? (p.totalCharged * p.baseAmount) /
                        (p.baseAmount + p.tipAmount)
                      : p.totalCharged;
                  const monto =
                    order.orderType === "flex_bill" ? flexMonto : p.baseAmount;
                  const prop =
                    order.orderType === "flex_bill"
                      ? p.totalCharged - flexMonto
                      : p.tipAmount;

                  return (
                    <Fragment key={p.id}>
                      <span className="text-even-evergreen/40 text-xs py-1.5 border-t border-even-evergreen/10">
                        {formatTimeOnly(p.createdAt)}
                      </span>
                      <span className="text-even-evergreen/60 text-xs truncate py-1.5 border-t border-even-evergreen/10">
                        {p.guestName ?? "—"}
                      </span>
                      <span className="text-even-evergreen/50 text-xs py-1.5 border-t border-even-evergreen/10">
                        {paymentTypeLabel(p.cardType)}
                      </span>
                      <span className="text-even-evergreen text-xs font-medium text-right py-1.5 border-t border-even-evergreen/10">
                        ${monto.toFixed(2)}
                      </span>
                      <span className="text-even-evergreen/30 text-xs text-right py-1.5 border-t border-even-evergreen/10">
                        {prop > 0 ? `+$${prop.toFixed(2)}` : "—"}
                      </span>
                    </Fragment>
                  );
                })}
              </div>
            )}

            {canAddDish && (
              <button
                onClick={() => setShowAddDish(true)}
                className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-even-evergreen/10 text-even-evergreen/80 text-xs font-medium uppercase tracking-wider hover:bg-even-evergreen/15 transition-colors active:scale-[0.98] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Agregar platillo
              </button>
            )}
            {canRegisterPayment && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-even-grass hover:bg-even-grass/90 text-even-evergreen text-xs font-medium uppercase tracking-wider transition-colors active:scale-[0.98] cursor-pointer"
              >
                <Banknote className="w-4 h-4" />
                Registrar pago
              </button>
            )}
            {canPrintTicket && (
              <button
                onClick={handlePrint}
                disabled={loadingTicket}
                className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-even-evergreen/10 hover:bg-even-evergreen/15 text-even-evergreen/80 text-xs font-medium uppercase tracking-wider transition-colors active:scale-[0.98] disabled:opacity-60 cursor-pointer"
              >
                {loadingTicket ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    Imprimir ticket
                  </>
                )}
              </button>
            )}
          </div>
        )}

      {showPaymentModal && currentBranch && (
        <CashPaymentModal
          order={order}
          branch={currentBranch}
          waiterSession={waiterSession}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            onPaymentRegistered?.();
          }}
        />
      )}
      {showAddDish && currentBranch && (
        <AddDishModal
          order={order}
          branch={currentBranch}
          requireWaiterLogin={requireWaiterLogin}
          onClose={() => setShowAddDish(false)}
          onSuccess={() => {
            setShowAddDish(false);
            onPaymentRegistered?.();
          }}
        />
      )}
      {printModalOpen && currentBranch && (
        <PrintTicketModal
          order={order}
          qrCode={ticketQR}
          branchId={currentBranch.id}
          onClose={() => setPrintModalOpen(false)}
        />
      )}
      {contactModalOpen && order.customerPhone && (
        <ContactCustomerModal
          customerName={order.customerName || order.identifier}
          phone={order.customerPhone}
          onClose={() => setContactModalOpen(false)}
        />
      )}
    </div>
  );
}

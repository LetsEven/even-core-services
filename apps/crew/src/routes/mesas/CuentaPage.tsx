import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../../lib/auth";
import { ArrowLeft, Banknote, Plus, User } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Modal,
  SheetCard,
  SheetFooter,
  SheetScreen,
} from "@even/ui";
import { useSession } from "../../app/session/context";
import DishItem from "../../components/DishItem";
import { getOrderProgress } from "../../features/cocina/board";
import CashPaymentModal from "../../components/CashPaymentModal";
import PrintTicketModal from "../../components/PrintTicketModal";
import ContactCustomerModal from "../../components/ContactCustomerModal";
import OrderMovementsModal from "../../components/OrderMovementsModal";
import AccountMenu, {
  type AccountMenuItem,
} from "../../features/cuenta/AccountMenu";
import {
  clampExtraMinutes,
  findOrderForUnit,
  formatMoney,
  getAccountPermissions,
  getAccountTotals,
  getWaiterState,
} from "../../features/cuenta/logic";
import {
  useTicket,
  useWaiterAssignment,
} from "../../features/cuenta/useCuenta";
import { usePullToDismiss } from "../../features/cuenta/usePullToDismiss";
import { isReprintEnabled, reprintComanda } from "../../services/printApi";
import type { Dish, Order } from "../../types";
import { formatFolio } from "../../utils/folio";

const SERVICE_LABELS: Record<string, string> = {
  tap: "Tap Order & Pay",
  pick_and_go: "Pick & Go",
  room: "Room Service",
  tap_pay: "Tap & Pay",
  flex_bill: "Flex Bill",
};

/** Orden fijo de la lista: primero lo que se prepara, al final lo entregado. */
function rankDishes(dishes: Dish[], readyAsDelivered: boolean): string[] {
  const rank = (d: Dish) =>
    d.status === "preparing"
      ? 0
      : d.status === "ready" && !readyAsDelivered
        ? 1
        : 2;
  return dishes
    .map((d, i) => ({ id: d.id, r: rank(d), i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
}

export default function CuentaPage() {
  const { unidad = "" } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { orders, ordersLoading } = useSession();
  const code = decodeURIComponent(unidad);
  const order = findOrderForUnit(orders, code);

  if (!order) {
    return (
      <SheetScreen className="min-h-0 flex-1">
        <SheetCard className="items-center justify-center gap-4 pt-10 text-center text-even-evergreen">
          <h1 className="text-lg font-medium">Mesa {code}</h1>
          <p className="text-sm text-even-evergreen/60">
            {ordersLoading
              ? "Cargando cuenta…"
              : "Esta mesa no tiene una cuenta abierta."}
          </p>
          {!ordersLoading && hasPermission("comanda.crear") && (
            <Button
              variant="primary"
              onClick={() =>
                navigate(`/mesas/${encodeURIComponent(code)}/comanda`)
              }
            >
              Abrir cuenta
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate("/mesas")}>
            Volver a Mesas
          </Button>
        </SheetCard>
      </SheetScreen>
    );
  }

  return <Cuenta order={order} code={code} />;
}

function Cuenta({ order, code }: { order: Order; code: string }) {
  const navigate = useNavigate();
  const { getToken, hasPermission } = useAuth();
  const canCharge = hasPermission("cuenta.cobrar");
  const canCreateComanda = hasPermission("comanda.crear");
  const s = useSession();
  const branch = s.currentBranch ?? null;

  const assignment = useWaiterAssignment(order, s.requireWaiterLogin);
  const ws = getWaiterState(
    assignment.waiterName,
    assignment.waiterId,
    s.waiterSession,
    s.availableWaiters,
  );
  const perms = getAccountPermissions(order, branch, ws);
  const totals = getAccountTotals(order);
  const ticket = useTicket(order, branch?.id);

  const [payOpen, setPayOpen] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [extra, setExtra] = useState(order.waiterExtraMinutes ?? 0);
  const [reprinting, setReprinting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Vista inicial: con platillos listos solo se muestran esos y "Entregar";
  // si no, la lista completa. El orden de la lista se congela al entrar.
  const readyDishes = order.dishes.filter((d) => d.status === "ready");
  const usesKitchen = order.orderType !== "tap_pay" && !perms.hideStatusButtons;
  const [view, setView] = useState<"pending" | "all">(
    usesKitchen && readyDishes.length > 0 ? "pending" : "all",
  );
  const [frozenOrder, setFrozenOrder] = useState<string[]>(() =>
    rankDishes(order.dishes, false),
  );
  const [delivering, setDelivering] = useState(false);

  const showAll = (readyAsDelivered: boolean) => {
    setFrozenOrder(rankDishes(order.dishes, readyAsDelivered));
    setView("all");
  };

  const deliverReady = async () => {
    setDelivering(true);
    try {
      await Promise.all(
        readyDishes.map((d) =>
          s.updateDish(
            order.id,
            order.orderType,
            d.id,
            "delivered",
            s.waiterSession?.name,
            s.waiterSession?.id,
          ),
        ),
      );
      showAll(true);
    } finally {
      setDelivering(false);
    }
  };

  const changeStatus = (dishId: string, status: Dish["status"]) =>
    void s.updateDish(
      order.id,
      order.orderType,
      dishId,
      status,
      s.waiterSession?.name,
      s.waiterSession?.id,
    );

  const position = (id: string) => {
    const i = frozenOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const listedDishes =
    view === "pending"
      ? readyDishes
      : [...order.dishes].sort((a, b) => position(a.id) - position(b.id));

  const delivered = order.dishes.filter((d) => d.status === "delivered").length;
  // Avance de cocina de lo pendiente de entregar (tap_pay no pasa por cocina).
  const progress =
    order.orderType === "tap_pay" ? null : getOrderProgress(order);
  const goBack = () => navigate("/mesas");

  // Jalar hacia abajo estando hasta arriba cierra la cuenta (no con un modal abierto).
  const cardRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  usePullToDismiss(
    cardRef,
    [cardRef, footerRef],
    goBack,
    !payOpen && !movementsOpen && !contactOpen && !extraOpen && !ticket.open,
  );

  const handleReprint = async () => {
    setReprinting(true);
    setNotice(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("sin token");
      await reprintComanda(order.orderType, order.id, token);
      setNotice({ ok: true, text: "Comanda enviada a reimprimir." });
    } catch (e) {
      setNotice({
        ok: false,
        text:
          e instanceof Error && e.message !== "sin token"
            ? e.message
            : "No se pudo reimprimir la comanda. Inténtalo de nuevo.",
      });
    } finally {
      setReprinting(false);
    }
  };

  const menu: AccountMenuItem[] = [];
  if (ws.isEven && ws.hasRealWaiters)
    menu.push({ key: "claim", label: "Asignarme", onSelect: assignment.claim });
  if (ws.isMine)
    menu.push({
      key: "release",
      label: "Desasignar",
      onSelect: assignment.release,
    });
  if (order.customerPhone)
    menu.push({
      key: "contact",
      label: "Contactar cliente",
      onSelect: () => setContactOpen(true),
    });
  if (perms.canEditPrepTime)
    menu.push({
      key: "extra",
      label: "Minutos extra",
      onSelect: () => {
        setExtra(order.waiterExtraMinutes ?? 0);
        setExtraOpen(true);
      },
    });
  if (perms.canPrintTicket)
    menu.push({
      key: "ticket",
      label: "Ticket",
      onSelect: () => void ticket.openTicket(),
    });
  if (isReprintEnabled())
    menu.push({
      key: "reprint",
      label: reprinting ? "Reimprimiendo…" : "Reimprimir comanda",
      onSelect: () => void handleReprint(),
    });
  if (perms.canViewMovements)
    menu.push({
      key: "movs",
      label: "Movimientos",
      onSelect: () => setMovementsOpen(true),
    });

  return (
    <SheetScreen className="min-h-0 flex-1">
      <SheetCard
        ref={cardRef}
        className="gap-5 pb-4 pt-6 text-even-evergreen"
      >
        {/* Encabezado */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              onClick={goBack}
              className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-even-evergreen/60 hover:text-even-evergreen"
            >
              <ArrowLeft className="size-3.5" /> Mesas
            </button>
            <h1 className="truncate text-2xl font-bold">
              {order.identifier || `Mesa ${code}`}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="soft" size="sm">
                {SERVICE_LABELS[order.orderType] ?? order.orderType}
              </Badge>
              {order.folio != null && order.folio !== "" && (
                <Badge variant="neutral" size="sm">
                  #{formatFolio(order.folio)}
                </Badge>
              )}
              <Badge variant="neutral" size="sm">
                <User className="size-3" /> {assignment.waiterName}
              </Badge>
              {order.orderType !== "tap_pay" && (
                <span className="text-xs text-even-evergreen/50">
                  {delivered}/{order.dishes.length} entregados
                </span>
              )}
            </div>
            {order.customerName && (
              <p className="mt-1 text-sm text-even-evergreen/70">
                {order.customerName}
              </p>
            )}
            {order.orderNotes && (
              <p className="mt-1 text-sm text-even-evergreen/70">
                Comentarios: {order.orderNotes}
              </p>
            )}
          </div>
          <AccountMenu items={menu} />
        </header>

        {/* Resumen de cocina: el mesero decide si lleva lo listo o espera al resto */}
        {progress && progress.pending > 0 && (
          <p
            role="status"
            className={
              progress.complete
                ? "rounded-xl border border-even-grass/60 bg-even-grass/20 px-4 py-3 text-sm font-medium text-even-evergreen"
                : "rounded-xl border border-amber-400/50 bg-amber-400/15 px-4 py-3 text-sm font-medium text-even-evergreen"
            }
          >
            {progress.complete
              ? `Pedido completo: ${progress.ready} ${progress.ready === 1 ? "platillo listo" : "platillos listos"} para entregar`
              : `${progress.ready} de ${progress.pending} ${progress.pending === 1 ? "platillo listo" : "platillos listos"} · faltan ${progress.preparing} en cocina`}
          </p>
        )}

        {/* Platillos y estados */}
        <section aria-label="Platillos" className="flex flex-col gap-4">
          {view === "pending" && (
            <p className="text-xs font-medium uppercase tracking-wider text-even-evergreen/60">
              Por entregar
            </p>
          )}
          {order.dishes.length === 0 && (
            <p className="text-sm text-even-evergreen/50">
              Aún no hay platillos en la cuenta.
            </p>
          )}
          {listedDishes.map((dish) => (
            <DishItem
              key={dish.id}
              dish={dish}
              hideStatusButtons={perms.hideStatusButtons || view === "pending"}
              hideStatusBadge={perms.hideStatusBadge}
              onStatusChange={changeStatus}
              onQuantityChange={
                view === "all" && perms.canEditDishes
                  ? (dishId, quantity) =>
                      s.updateDishQuantity(
                        order.id,
                        dishId,
                        quantity,
                        s.waiterSession?.name,
                        s.waiterSession?.id,
                      )
                  : undefined
              }
            />
          ))}
          {view === "pending" && (
            <div className="flex flex-col gap-2 pt-1">
              <Button
                variant="primary"
                fullWidth
                loading={delivering}
                onClick={() => void deliverReady()}
              >
                Entregar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => showAll(false)}>
                Ver todos los productos
              </Button>
            </div>
          )}
        </section>

        {notice && (
          <p
            role="status"
            className={`text-sm ${notice.ok ? "text-even-evergreen" : "text-rose-600"}`}
          >
            {notice.text}
          </p>
        )}

        {/* Reserva el alto del pie fijo */}
        <div className="h-36" aria-hidden />
      </SheetCard>

      {/* Total siempre visible + acciones 50/50 */}
      <SheetFooter ref={footerRef} className="flex flex-col gap-3 pt-3">
        {totals.hasAmounts && (
          <div className="flex items-baseline justify-between gap-3 text-even-evergreen">
            <span className="text-xs uppercase tracking-widest text-even-evergreen/60">
              Total
            </span>
            <span className="text-xl font-bold tabular-nums">
              {formatMoney(totals.total)}
            </span>
          </div>
        )}
        {totals.hasAmounts && totals.paid > 0 && (
          <div className="-mt-2 flex justify-between text-xs text-even-evergreen/60">
            <span>Pagado {formatMoney(totals.paid)}</span>
            <span
              className={
                (order.remainingAmount ?? 0) > 0 ? "text-amber-600" : ""
              }
            >
              Restante {formatMoney(totals.remaining)}
            </span>
          </div>
        )}
        <div className="flex gap-3">
          {perms.canAddDish && canCreateComanda && (
            <Button
              variant="outline"
              className="flex-1 justify-center"
              onClick={() =>
                navigate(`/mesas/${encodeURIComponent(code)}/comanda`)
              }
            >
              <Plus className="size-4" /> Agregar
            </Button>
          )}
          {perms.canRegisterPayment && canCharge && (
            <Button
              variant="primary"
              className="flex-1 justify-center"
              onClick={() => setPayOpen(true)}
            >
              <Banknote className="size-4" /> Cobrar
            </Button>
          )}
        </div>
      </SheetFooter>

      {payOpen && branch && (
        <CashPaymentModal
          order={order}
          branch={branch}
          waiterSession={s.waiterSession}
          onClose={() => setPayOpen(false)}
          onSuccess={() => {
            setPayOpen(false);
            void s.fetchOrders(false);
          }}
        />
      )}
      {ticket.open && branch && (
        <PrintTicketModal
          order={order}
          qrCode={ticket.qr}
          branchId={branch.id}
          onClose={ticket.close}
        />
      )}
      {movementsOpen && (
        <OrderMovementsModal
          order={order}
          onClose={() => setMovementsOpen(false)}
        />
      )}
      {contactOpen && order.customerPhone && (
        <ContactCustomerModal
          customerName={order.customerName || order.identifier}
          phone={order.customerPhone}
          onClose={() => setContactOpen(false)}
        />
      )}
      <Modal
        open={extraOpen}
        onClose={() => setExtraOpen(false)}
        title="Minutos extra"
        description={`${order.prepTimeMinutes ?? 0} + ${extra} = ${(order.prepTimeMinutes ?? 0) + extra} min`}
        footer={
          <Button
            fullWidth
            onClick={() => {
              setExtraOpen(false);
              void s.updatePrepTimeExtraMinutes(order.id, extra);
            }}
          >
            Guardar
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            type="number"
            min={0}
            max={60}
            value={extra}
            aria-label="Minutos extra"
            onChange={(e) =>
              setExtra(clampExtraMinutes(Number(e.target.value)))
            }
          />
          <div className="flex gap-2">
            {[5, 10, 15].map((m) => (
              <Button
                key={m}
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setExtra((v) => clampExtraMinutes(v + m))}
              >
                +{m}
              </Button>
            ))}
          </div>
        </div>
      </Modal>
    </SheetScreen>
  );
}

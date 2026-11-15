import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../../lib/auth";
import { ArrowLeft, Banknote, Plus, Printer, User } from "lucide-react";
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
import { isReprintEnabled, reprintComanda } from "../../services/printApi";
import type { Order } from "../../types";
import { formatFolio } from "../../utils/folio";

const SERVICE_LABELS: Record<string, string> = {
  tap: "Tap Order & Pay",
  pick_and_go: "Pick & Go",
  room: "Room Service",
  tap_pay: "Tap & Pay",
  flex_bill: "Flex Bill",
};

export default function CuentaPage() {
  const { unidad = "" } = useParams();
  const navigate = useNavigate();
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
          {!ordersLoading && (
            <Button
              variant="primary"
              onClick={() => navigate(`/mesas/${encodeURIComponent(code)}/comanda`)}
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
  const { getToken } = useAuth();
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

  const delivered = order.dishes.filter((d) => d.status === "delivered").length;
  const goBack = () => navigate("/mesas");

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
  if (perms.canViewMovements)
    menu.push({
      key: "movs",
      label: "Movimientos",
      onSelect: () => setMovementsOpen(true),
    });

  return (
    <SheetScreen className="min-h-0 flex-1">
      <SheetCard className="gap-5 pb-4 pt-6 text-even-evergreen">
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

        {/* Platillos y estados */}
        <section aria-label="Platillos" className="flex flex-col gap-4">
          {order.dishes.length === 0 && (
            <p className="text-sm text-even-evergreen/50">
              Aún no hay platillos en la cuenta.
            </p>
          )}
          {order.dishes.map((dish) => (
            <DishItem
              key={dish.id}
              dish={dish}
              hideStatusButtons={perms.hideStatusButtons}
              hideStatusBadge={perms.hideStatusBadge}
              onStatusChange={(dishId, status) =>
                void s.updateDish(
                  order.id,
                  order.orderType,
                  dishId,
                  status,
                  s.waiterSession?.name,
                  s.waiterSession?.id,
                )
              }
              onQuantityChange={
                perms.canEditDishes
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
        </section>

        {/* Totales */}
        {totals.hasAmounts && (
          <section
            aria-label="Totales"
            className="grid grid-cols-3 gap-3 rounded-2xl bg-even-evergreen/5 px-4 py-3 text-center"
          >
            <Amount label="Total" value={formatMoney(totals.total)} />
            <Amount label="Pagado" value={formatMoney(totals.paid)} />
            <Amount
              label="Restante"
              value={formatMoney(totals.remaining)}
              warn={(order.remainingAmount ?? 0) > 0}
            />
          </section>
        )}

        {notice && (
          <p
            role="status"
            className={`text-sm ${notice.ok ? "text-even-evergreen" : "text-rose-600"}`}
          >
            {notice.text}
          </p>
        )}

        {/* Reserva el alto del pie fijo */}
        <div className="h-24" aria-hidden />
      </SheetCard>

      {/* Acciones */}
      <SheetFooter className="sticky flex flex-wrap items-center gap-2 pt-3">
        {perms.canAddDish && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(`/mesas/${encodeURIComponent(code)}/comanda`)
            }
          >
            <Plus className="size-4" /> Agregar
          </Button>
        )}
        {perms.canPrintTicket && (
          <Button
            variant="outline"
            size="sm"
            loading={ticket.loading}
            onClick={() => void ticket.openTicket()}
          >
            <Printer className="size-4" /> Ticket
          </Button>
        )}
        {isReprintEnabled() && (
          <Button
            variant="outline"
            size="sm"
            loading={reprinting}
            onClick={() => void handleReprint()}
          >
            <Printer className="size-4" /> Reimprimir comanda
          </Button>
        )}
        {perms.canRegisterPayment && (
          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            onClick={() => setPayOpen(true)}
          >
            <Banknote className="size-4" /> Cobrar
          </Button>
        )}
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
            onChange={(e) => setExtra(clampExtraMinutes(Number(e.target.value)))}
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

function Amount({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.625rem] uppercase tracking-widest text-even-evergreen/60">
        {label}
      </span>
      <span
        className={`text-base font-semibold ${warn ? "text-amber-600" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

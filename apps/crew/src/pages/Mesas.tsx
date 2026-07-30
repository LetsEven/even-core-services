import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  ChevronLeft,
  ChevronDown,
  Check,
  RefreshCw,
  X,
  Loader2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  getTablesForBranch,
  getTableActiveSummary,
  getQRCodesForBranch,
  peekTablePOS,
  openTableAccount,
} from "../services/api";
import type {
  Branch,
  TableRow,
  QRCodeRow,
  TableActiveSummary,
  TableDish,
} from "../services/api";

interface Props {
  onBack: () => void;
  branchId: string | null;
  branches: Branch[];
  onBranchChange: (id: string) => void;
}

function formatMXN(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount);
}

function circleClass(table: TableRow, hasPOS: boolean): string {
  if (table.status === "maintenance")
    return "bg-even-evergreen/5 border border-even-evergreen/10 text-even-evergreen/25 cursor-default";
  if (table.has_tap_pay_account)
    return "bg-even-evergreen border border-even-evergreen text-even-offwhite shadow-[0_0_18px_rgba(2,56,40,0.25)] hover:bg-even-evergreen/90 active:scale-90";
  if (table.has_open_account)
    return "bg-even-grass border border-even-grass/60 text-even-evergreen shadow-[0_0_20px_rgba(130,230,87,0.45)] hover:bg-even-grass/90 active:scale-90";
  if (hasPOS)
    return "animate-pulse bg-even-grass border border-even-grass/60 text-even-evergreen shadow-[0_0_20px_rgba(130,230,87,0.45)] hover:bg-even-grass/90 active:scale-90";
  return "bg-white border border-even-evergreen/15 text-even-evergreen shadow-sm hover:bg-even-evergreen/5 active:scale-90";
}

const DISH_STATUS_LABEL: Record<string, string> = {
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Entregado",
  not_paid: "Sin pagar",
  pending: "Sin pagar",
  partial: "Pago parcial",
  paid: "Pagado",
};

const DISH_STATUS_COLOR: Record<string, string> = {
  preparing: "text-amber-400",
  ready: "text-blue-300",
  delivered: "text-even-offwhite/20",
  not_paid: "text-rose-400",
  pending: "text-rose-400",
  partial: "text-amber-400",
  paid: "text-even-grass",
};

function dishLabel(dish: TableDish): string {
  if (dish.payment_status === "not_paid" || dish.payment_status === "pending") {
    return DISH_STATUS_LABEL[dish.status] ?? dish.status;
  }
  const key = dish.payment_status ?? dish.status;
  return DISH_STATUS_LABEL[key] ?? key;
}

function dishColor(dish: TableDish): string {
  if (dish.payment_status === "not_paid" || dish.payment_status === "pending") {
    return DISH_STATUS_COLOR[dish.status] ?? "text-even-offwhite/30";
  }
  const key = dish.payment_status ?? dish.status;
  return DISH_STATUS_COLOR[key] ?? "text-even-offwhite/30";
}

const STATUS_LABELS: Record<string, string> = {
  not_paid: "Sin pagar",
  pending: "Sin pagar",
  partial: "Pago parcial",
  paid: "Pagado",
  active: "Activo",
};

const STATUS_PILL: Record<string, string> = {
  not_paid: "text-rose-300 bg-rose-500/15 border-rose-400/25",
  pending: "text-rose-300 bg-rose-500/15 border-rose-400/25",
  partial: "text-amber-300 bg-amber-500/15 border-amber-400/25",
  paid: "text-even-grass bg-even-grass/15 border-even-grass/25",
  active: "text-even-aqua bg-even-aqua/10 border-even-aqua/25",
};

export default function Mesas({
  onBack,
  branchId,
  branches,
  onBranchChange,
}: Props) {
  const { getToken } = useAuth();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [qrCodes, setQrCodes] = useState<QRCodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posTables, setPosTables] = useState<Set<number>>(new Set());

  const [selectedTable, setSelectedTable] = useState<TableRow | null>(null);
  const [activeSummary, setActiveSummary] = useState<TableActiveSummary | null>(
    null,
  );
  const [checkingTableId, setCheckingTableId] = useState<string | null>(null);
  const [confirmTable, setConfirmTable] = useState<TableRow | null>(null);
  const [openingAccount, setOpeningAccount] = useState(false);
  const [serviceChoiceTable, setServiceChoiceTable] = useState<TableRow | null>(
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
      setPosTables(new Set());
      try {
        const token = await getToken();
        if (!token) return;
        const [t, q] = await Promise.all([
          getTablesForBranch(branchId, token),
          getQRCodesForBranch(branchId, token),
        ]);
        setTables(t);
        setQrCodes(q);
        // Pre-load POS status for all free tables in parallel (fire-and-forget)
        const freeTables = t.filter(
          (t) => !t.has_open_account && t.status !== "maintenance",
        );
        Promise.allSettled(
          freeTables.map((ft) =>
            peekTablePOS(branchId, ft.table_number, token).then((has) => ({
              tableNumber: ft.table_number,
              has,
            })),
          ),
        ).then((results) => {
          const posSet = new Set<number>();
          for (const r of results) {
            if (r.status === "fulfilled" && r.value.has)
              posSet.add(r.value.tableNumber);
          }
          setPosTables(posSet);
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error al cargar mesas");
      } finally {
        setLoading(false);
      }
    },
    [getToken, branchId],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setBranchOpen(false);
      }
    };
    if (branchOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [branchOpen]);

  async function handleTableClick(table: TableRow) {
    if (!branchId || table.status === "maintenance" || checkingTableId) return;
    setCheckingTableId(table.id);
    try {
      const token = await getToken();
      if (!token) return;
      if (table.has_open_account) {
        const summary = await getTableActiveSummary(
          branchId,
          table.table_number,
          token,
        );
        setActiveSummary(summary);
        setSelectedTable(table);
      } else if (posTables.has(table.table_number)) {
        setConfirmTable(table);
      } else {
        const hasPOS = await peekTablePOS(branchId, table.table_number, token);
        if (hasPOS) setConfirmTable(table);
      }
    } catch {
    } finally {
      setCheckingTableId(null);
    }
  }

  async function handleConfirmOpen(service?: "tap_pay" | "flex_bill") {
    const table = confirmTable ?? serviceChoiceTable;
    if (!branchId || !table) return;
    setOpeningAccount(true);
    try {
      const token = await getToken();
      if (!token) return;
      console.log("[MESAS] openTableAccount →", table.table_number, service);
      const result = await openTableAccount(
        branchId,
        table.table_number,
        token,
        service,
      );
      console.log("[MESAS] openTableAccount result:", result);
      if (result.needsServiceChoice) {
        setServiceChoiceTable(table);
        setConfirmTable(null);
        return;
      }
      if (result.order) {
        const summary = await getTableActiveSummary(
          branchId,
          table.table_number,
          token,
        );
        setActiveSummary(summary);
        setSelectedTable(table);
        fetchData(false);
      }
      setServiceChoiceTable(null);
    } catch (err) {
      console.error("[MESAS] handleConfirmOpen error:", err);
    } finally {
      setConfirmTable(null);
      setOpeningAccount(false);
    }
  }

  function closeModal() {
    setSelectedTable(null);
    setActiveSummary(null);
  }

  const selectedQR = selectedTable
    ? (qrCodes.find((q) => q.table_number === selectedTable.table_number) ??
      null)
    : null;

  const tapPayCount = tables.filter((t) => t.has_tap_pay_account).length;
  const activeCount = tables.filter(
    (t) => t.has_open_account && !t.has_tap_pay_account,
  ).length;
  const availableCount = tables.filter(
    (t) => !t.has_open_account && t.status !== "maintenance",
  ).length;

  return (
    <div
      className="relative min-h-screen flex flex-col"
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
        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-even-offwhite/60 hover:text-even-offwhite hover:bg-white/10 transition-colors text-sm disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </header>

      {/* Title + stats */}
      <div className="flex flex-col items-center pb-5 gap-1">
        <h1 className="text-even-offwhite font-medium text-xl uppercase tracking-widest">
          Mesas
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
        {tables.length > 0 && !loading && (
          <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
            {tapPayCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded uppercase tracking-wider bg-white/15 border border-white/30 text-even-offwhite font-medium">
                {tapPayCount} en cobro
              </span>
            )}
            {activeCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded uppercase tracking-wider bg-even-grass/20 border border-even-grass/30 text-even-grass font-medium">
                {activeCount} {activeCount === 1 ? "activa" : "activas"}
              </span>
            )}
            <span className="text-[11px] px-2 py-0.5 rounded uppercase tracking-wider bg-white/10 border border-white/15 text-even-offwhite/60 font-medium">
              {availableCount} {availableCount === 1 ? "libre" : "libres"}
            </span>
          </div>
        )}
      </div>

      {/* Glass panel */}
      <div
        className="flex-1 rounded-t-lg px-6 py-6 flex flex-col min-h-0 overflow-y-auto text-even-evergreen"
        style={{ background: "#FEFEEB" }}
      >
        {!branchId && (
          <p className="text-even-evergreen/50 text-center mt-10">
            Selecciona una sucursal para ver las mesas.
          </p>
        )}

        {branchId && loading && (
          <div className="flex justify-center mt-16">
            <Loader2 className="w-8 h-8 text-even-evergreen/40 animate-spin" />
          </div>
        )}

        {branchId && !loading && error && (
          <p className="text-rose-600 text-center mt-10 text-sm">{error}</p>
        )}

        {branchId && !loading && !error && tables.length === 0 && (
          <p className="text-even-evergreen/50 text-center mt-10 text-sm">
            No hay mesas registradas para esta sucursal.
          </p>
        )}

        {branchId && !loading && !error && tables.length > 0 && (
          <div className="grid grid-cols-4 gap-4 justify-items-center">
            {tables.map((table) => (
              <button
                key={table.id}
                onClick={() => handleTableClick(table)}
                disabled={table.status === "maintenance" || !!checkingTableId}
                className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-150 disabled:cursor-default cursor-pointer ${circleClass(table, posTables.has(table.table_number))}`}
              >
                {checkingTableId === table.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  table.table_number
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Confirmación abrir cuenta */}
      {confirmTable && (
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
                Mesa {confirmTable.table_number}
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
                onClick={() => setConfirmTable(null)}
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
      {serviceChoiceTable && (
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
                Mesa {serviceChoiceTable.table_number}
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
              onClick={() => setServiceChoiceTable(null)}
              disabled={openingAccount}
              className="text-even-offwhite/40 text-xs uppercase tracking-wider hover:text-even-offwhite/70 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {selectedTable && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
          }}
          onClick={closeModal}
        >
          <div
            className="w-full max-w-sm rounded-t-lg sm:rounded-lg overflow-hidden flex flex-col border border-white/10 shadow-2xl"
            style={{ background: "#023828", maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div>
                <p className="text-even-offwhite/40 text-xs uppercase tracking-widest mb-0.5">
                  Mesa
                </p>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-even-offwhite font-bold text-2xl leading-none">
                    {selectedTable.table_number}
                  </h2>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-md text-even-offwhite/30 hover:text-even-offwhite hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-5 flex flex-col gap-4 overflow-y-auto">
              {/* Service + total header */}
              {activeSummary && (
                <div
                  className="w-full rounded-lg border border-white/8 px-4 py-4"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1.5">
                      <p className="text-even-offwhite/80 font-semibold text-sm">
                        {activeSummary.label}
                      </p>
                      <span
                        className={`self-start text-[11px] px-2 py-0.5 rounded border uppercase tracking-wider ${STATUS_PILL[activeSummary.status] ?? "text-even-offwhite/40 bg-white/5 border-white/10"}`}
                      >
                        {STATUS_LABELS[activeSummary.status] ??
                          activeSummary.status}
                      </span>
                    </div>
                    <p className="text-even-offwhite font-bold text-2xl">
                      {formatMXN(activeSummary.total)}
                    </p>
                  </div>
                  {activeSummary.paid_amount != null && (
                    <div className="flex gap-3 mt-3 pt-3 border-t border-white/8">
                      <div className="flex flex-col items-center flex-1">
                        <span className="text-xs text-even-offwhite/40">
                          Pagado
                        </span>
                        <span className="text-sm font-semibold text-even-grass">
                          {formatMXN(activeSummary.paid_amount)}
                        </span>
                      </div>
                      <div className="flex flex-col items-center flex-1">
                        <span className="text-xs text-even-offwhite/40">
                          Pendiente
                        </span>
                        <span
                          className={`text-sm font-semibold ${(activeSummary.remaining_amount ?? 0) > 0 ? "text-amber-400" : "text-even-grass"}`}
                        >
                          {formatMXN(activeSummary.remaining_amount ?? 0)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Dishes */}
              {activeSummary?.dishes && activeSummary.dishes.length > 0 && (
                <div
                  className="w-full rounded-lg border border-white/8 px-4 py-3 space-y-2"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  {activeSummary.dishes.map((dish, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-even-offwhite/70 text-sm">
                        <span className="text-even-offwhite/30 mr-1.5">
                          {dish.quantity}×
                        </span>
                        {dish.item}
                      </span>
                      {activeSummary?.service !== "tap_pay" && (
                        <span
                          className={`text-xs shrink-0 font-medium ${dishColor(dish)}`}
                        >
                          {dishLabel(dish)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Payments */}
              {activeSummary?.payments && activeSummary.payments.length > 0 && (
                <div
                  className="w-full rounded-lg border border-white/8 px-4 py-3 space-y-2"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <p className="text-even-offwhite/25 text-xs uppercase tracking-widest mb-1">
                    Pagos registrados
                  </p>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center">
                    <span className="text-[10px] uppercase text-even-offwhite/30 font-medium pb-1">
                      Quién
                    </span>
                    <span className="text-[10px] uppercase text-even-offwhite/30 font-medium text-right pb-1">
                      Monto
                    </span>
                    <span className="text-[10px] uppercase text-even-offwhite/30 font-medium text-right pb-1">
                      Prop
                    </span>
                    {activeSummary.payments.map((p, i) => (
                      <>
                        <span
                          key={`name-${i}`}
                          className="text-even-offwhite/60 text-sm truncate py-1.5 border-t border-white/8"
                        >
                          {p.guestName ?? "—"}
                        </span>
                        <span
                          key={`base-${i}`}
                          className="text-even-grass text-sm font-medium text-right py-1.5 border-t border-white/8"
                        >
                          {formatMXN(p.baseAmount)}
                        </span>
                        <span
                          key={`tip-${i}`}
                          className="text-even-offwhite/30 text-sm text-right py-1.5 border-t border-white/8"
                        >
                          {p.tipAmount > 0 ? `+${formatMXN(p.tipAmount)}` : "—"}
                        </span>
                      </>
                    ))}
                  </div>
                  {(activeSummary.remaining_amount ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-white/8">
                      <span className="text-even-offwhite/40">Pendiente</span>
                      <span className="text-rose-400 font-semibold">
                        {formatMXN(activeSummary.remaining_amount!)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* QR — solo Tap & Pay */}
              {activeSummary?.service === "tap_pay" &&
                (selectedQR ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-white p-3 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                      <QRCodeSVG
                        value={`https://letseven.io/qr/${selectedQR.code}`}
                        size={180}
                        level="H"
                        marginSize={0}
                      />
                    </div>
                    <p className="text-xs text-even-offwhite/25 font-mono tracking-wider">
                      {selectedQR.code}
                    </p>
                  </div>
                ) : (
                  <p className="text-even-offwhite/25 text-sm text-center py-2">
                    Sin QR asignado
                  </p>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

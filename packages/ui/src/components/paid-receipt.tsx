"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "motion/react";
import { Download, FileText, Loader2 } from "lucide-react";
import { useModalBackClose } from "../lib/use-modal-back-close";
import { ReceiptPaper, ReceiptRow, ReceiptRule, ReceiptStamp, RECEIPT_PRINT_MS } from "./receipt-paper";

const EASE = [0.32, 0.72, 0, 1] as const;
const MOVE_S = 0.5;

export type PaidReceiptLabels = {
  total: string;
  paidStamp: string;
  tapForDetail: string;
  itemsCount: (count: number) => string;
  orderItems: string;
  consumption: string;
  tip: string;
  installments: (months: number) => string;
  download: string;
  viewInvoice: string;
  invoice: string;
  close: string;
};

/** Datos del pago guardados por el flujo de cobro. */
export interface PaidReceiptPayment {
  cardBrand?: string;
  cardLast4?: string | number;
  installments?: number;
  userName?: string;
  baseAmount?: number;
  displaySubtotal?: number;
  evenCommissionClient?: number;
  ivaEvenClient?: number;
  tipAmount?: number;
  displayPropina?: number;
  totalAmountCharged?: number;
  installmentBaseAmount?: number;
}

/** Platillo cubierto por el pago. */
export interface PaidReceiptDish {
  dish_order_id?: string | number;
  item?: string;
  quantity?: number;
  total_display_price?: number;
  total_price?: number;
  guest_name?: string;
  custom_fields?: unknown;
}

export interface PaidReceiptProps {
  restaurantName: string;
  /** Texto ya traducido, p. ej. "Mesa 4". */
  tableLabel: string;
  /** Formato de la fecha del ticket, según el idioma de la app. */
  formatDate: (date: Date) => string;
  labels: PaidReceiptLabels;
  paymentDetails: PaidReceiptPayment | null | undefined;
  paymentType: string;
  amount: number;
  /** Platillos que cubre este pago (vacío en dividir cuenta / elegir monto). */
  dishOrders: PaidReceiptDish[];
  /** Personalizaciones y notas de un platillo (cada app tiene su `ItemCustomizations`). */
  renderCustomizations?: (dish: PaidReceiptDish, lineTotal: number) => ReactNode;
  onDownload: () => void;
  isDownloading: boolean;
  /** Mostrar el botón de factura (el restaurante tiene facturación). */
  invoiceEnabled: boolean;
  hasInvoice: boolean;
  onInvoice: () => void;
}

type Rect = { top: number; left: number; width: number; height: number };

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const money = (value: number) => "$" + value.toFixed(2);

function cardLabel(details: PaidReceiptPayment | null | undefined): string | null {
  if (details?.cardBrand === "apple") return "Apple Pay";
  if (details?.cardBrand === "google") return "Google Pay";
  if (details?.cardLast4) return `**** ${String(details.cardLast4).slice(-4)}`;
  return null;
}

/**
 * El ticket de "PAGADO": se imprime con el sello y, al tocarlo, el mismo papel
 * se extiende sobre un fondo borroso con el desglose y las acciones.
 */
export function PaidReceipt(props: PaidReceiptProps) {
  const { restaurantName, tableLabel, formatDate, labels, paymentType, amount, dishOrders } = props;
  const pd = props.paymentDetails ?? {};

  const [printed, setPrinted] = useState(false);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<Rect | null>(null);
  const collapsedRef = useRef<HTMLDivElement>(null);
  // Fecha fija durante la vida del ticket
  const [now] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setTimeout(() => setPrinted(true), RECEIPT_PRINT_MS + 600);
    return () => window.clearTimeout(timer);
  }, []);

  const openReceipt = () => {
    const el = collapsedRef.current;
    if (!el || !printed) return;
    const r = el.getBoundingClientRect();
    setFrom({ top: r.top, left: r.left, width: r.width, height: r.height });
    setOpen(true);
  };

  const card = cardLabel(pd);
  const baseAmount = pd.baseAmount ?? 0;
  const tipAmount = pd.tipAmount ?? 0;
  const consumptionTotal = baseAmount + (pd.evenCommissionClient || 0) + (pd.ivaEvenClient || 0);
  const title = (
    <div className="text-center">
      <h2 className="font-mono text-base font-bold uppercase tracking-wide">{restaurantName}</h2>
      <p className="text-xs text-even-ink/55">
        {tableLabel} · {formatDate(now)}
      </p>
    </div>
  );

  const totalValue = pd.installments
    ? `${pd.installments}x ${money(amount / pd.installments)} MXN`
    : amount > 0
      ? `${money(Number(amount))} MXN`
      : undefined;

  const totalRow = (animatedStamp: boolean) => (
    <>
      <ReceiptRow strong left={labels.total} right={totalValue} />
      {/* El sello cae en su propio espacio, sin tapar el importe */}
      <div className="relative h-14">
        <ReceiptStamp label={labels.paidStamp} animated={animatedStamp} />
      </div>
    </>
  );

  return (
    <>
      <div
        ref={collapsedRef}
        role="button"
        tabIndex={printed ? 0 : -1}
        aria-label={labels.tapForDetail}
        onClick={openReceipt}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openReceipt();
          }
        }}
        className={`outline-none ${printed ? "cursor-pointer" : ""}`}
        style={{ visibility: open ? "hidden" : "visible" }}
      >
        <ReceiptPaper mode="print">
          {title}
          <ReceiptRule />
          {dishOrders.length > 0 && (
            <ReceiptRow left={labels.itemsCount(dishOrders.length)} />
          )}
          {card && <ReceiptRow left={card} />}
          <ReceiptRule />
          {totalRow(true)}
          <p
            className={`mt-3 text-center text-[11px] uppercase tracking-wider text-even-ink/45 transition-opacity duration-500 ${
              printed ? "opacity-100" : "opacity-0"
            }`}
          >
            {labels.tapForDetail}
          </p>
        </ReceiptPaper>
      </div>

      {open && from && (
        <ExpandedOverlay from={from} onClosed={() => setOpen(false)}>
          {(close) => (
            <ReceiptPaper mode="static">
              {title}
              <ReceiptRule />
              {pd.userName && <ReceiptRow left={pd.userName} />}
              {card && <ReceiptRow left={card} />}

              {(dishOrders.length > 0 ||
                paymentType === "choose-amount" ||
                paymentType === "equal-shares") && (
                <>
                  <ReceiptRule />
                  <p className="pb-1 text-xs font-bold uppercase tracking-wider text-even-ink/55">
                    {labels.orderItems}
                  </p>
                  {dishOrders.map((dish, index) => {
                    const lineTotal = dish.total_display_price ?? dish.total_price ?? 0;
                    return (
                      <ReceiptRow
                        key={dish.dish_order_id || index}
                        left={
                          <span className="capitalize">
                            {dish.quantity}x {dish.item}
                          </span>
                        }
                        right={`$${lineTotal.toFixed(2)}`}
                        sub={
                          <>
                            {dish.guest_name && <span className="uppercase">{dish.guest_name}</span>}
                            {props.renderCustomizations?.(dish, lineTotal)}
                          </>
                        }
                      />
                    );
                  })}
                  {(paymentType === "choose-amount" || paymentType === "equal-shares") && baseAmount > 0 && (
                    <ReceiptRow left={labels.consumption} right={money(pd.displaySubtotal ?? consumptionTotal)} />
                  )}
                </>
              )}

              {(tipAmount > 0 || !!pd.installments) && (
                <>
                  <ReceiptRule />
                  {tipAmount > 0 ? (
                    <ReceiptRow left={labels.tip} right={money(pd.displayPropina ?? tipAmount)} />
                  ) : null}
                  {pd.installments ? (
                    <ReceiptRow
                      left={labels.installments(pd.installments)}
                      right={money((pd.totalAmountCharged || 0) - (pd.installmentBaseAmount || 0))}
                    />
                  ) : null}
                </>
              )}

              <ReceiptRule />
              {totalRow(false)}
              <ReceiptRule />

              <div className="flex flex-col gap-2">
                <ReceiptButton onClick={props.onDownload}>
                  {props.isDownloading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {labels.download}
                </ReceiptButton>
                {props.invoiceEnabled && (
                  <ReceiptButton onClick={props.onInvoice}>
                    <FileText className="size-4" />
                    {props.hasInvoice ? labels.viewInvoice : labels.invoice}
                  </ReceiptButton>
                )}
                <button
                  onClick={close}
                  className="mt-1 py-2 text-xs font-medium uppercase tracking-wider text-even-ink/55 cursor-pointer"
                >
                  {labels.close}
                </button>
              </div>
            </ReceiptPaper>
          )}
        </ExpandedOverlay>
      )}
    </>
  );
}

function ReceiptButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-even-ink/80 py-2.5 text-sm font-bold uppercase tracking-wide text-even-ink transition-transform active:scale-95 cursor-pointer"
    >
      {children}
    </button>
  );
}

/**
 * Fondo borroso + el papel expandido. El papel nace con la misma posición y tamaño
 * que el ticket de arriba (se recorta a su alto) y crece hasta mostrar todo el contenido.
 */
function ExpandedOverlay({
  from,
  onClosed,
  children,
}: {
  from: Rect;
  onClosed: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);

  const startState = () => {
    const wr = wrapRef.current!.getBoundingClientRect();
    const dx = from.left - wr.left;
    const dy = from.top - wr.top;
    const clipBottom = Math.max(wr.height - from.height, 0);
    return {
      transform: `translate(${dx}px, ${dy}px)`,
      clipPath: `inset(0px 0px ${clipBottom}px 0px)`,
    };
  };

  useLayoutEffect(() => {
    const paper = paperRef.current;
    const backdrop = backdropRef.current;
    if (!paper || !backdrop || prefersReducedMotion()) return;
    const s = startState();
    paper.style.transform = s.transform;
    paper.style.clipPath = s.clipPath;
    animate(backdrop, { opacity: [0, 1] }, { duration: 0.3 });
    animate(
      paper,
      { transform: [s.transform, "translate(0px, 0px)"], clipPath: [s.clipPath, "inset(0px 0px 0px 0px)"] },
      { duration: MOVE_S, ease: EASE },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => setClosing(true), []);

  useEffect(() => {
    if (!closing) return;
    const paper = paperRef.current;
    const backdrop = backdropRef.current;
    if (!paper || !backdrop || prefersReducedMotion()) {
      onClosed();
      return;
    }
    const s = startState();
    animate(backdrop, { opacity: [1, 0] }, { duration: 0.3 });
    animate(
      paper,
      { transform: ["translate(0px, 0px)", s.transform], clipPath: ["inset(0px 0px 0px 0px)", s.clipPath] },
      { duration: MOVE_S * 0.8, ease: EASE },
    ).then(onClosed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  // El botón "atrás" del teléfono cierra el ticket en vez de salir de la pantalla
  useModalBackClose(true, close);

  return (
    <div className="fixed inset-0 z-[999]">
      <div ref={backdropRef} className="absolute inset-0 bg-black/45 backdrop-blur-md" onClick={close} />
      <div
        className="absolute inset-0 overflow-y-auto overscroll-contain"
        onClick={(e) => {
          if (e.target === e.currentTarget || e.target === wrapRef.current?.parentElement) close();
        }}
      >
        <div className="flex min-h-full items-center justify-center px-6 py-8" onClick={(e) => e.target === e.currentTarget && close()}>
          <div ref={wrapRef} style={{ width: from.width }} className="max-w-full">
            <div ref={paperRef}>{children(close)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

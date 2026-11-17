"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { Download, FileText, Loader2 } from "lucide-react";
import {
  ReceiptPaper,
  ReceiptRow,
  ReceiptRule,
  ReceiptStamp,
  RECEIPT_PRINT_MS,
  useModalBackClose,
} from "@even/ui";
import ItemCustomizations from "@/app/components/ItemCustomizations";

const EASE = [0.32, 0.72, 0, 1] as const;
const MOVE_S = 0.5;

interface PaidReceiptProps {
  restaurantName: string;
  tableNumber: string | number;
  paymentDetails: any;
  paymentType: string;
  amount: number;
  /** Platillos que cubre este pago (vacío en dividir cuenta / elegir monto). */
  dishOrders: any[];
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

function cardLabel(details: any): string | null {
  if (details?.cardBrand === "apple") return "Apple Pay";
  if (details?.cardBrand === "google") return "Google Pay";
  if (details?.cardLast4) return `**** ${String(details.cardLast4).slice(-4)}`;
  return null;
}

/**
 * El ticket de "PAGADO": se imprime con el sello y, al tocarlo, el mismo papel
 * se extiende sobre un fondo borroso con el desglose y las acciones.
 */
export default function PaidReceipt(props: PaidReceiptProps) {
  const t = useTranslations("PaymentSuccessPage");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const { restaurantName, tableNumber, paymentDetails, paymentType, amount, dishOrders } = props;

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

  const card = cardLabel(paymentDetails);
  const title = (
    <div className="text-center">
      <h2 className="font-mono text-base font-bold uppercase tracking-wide">{restaurantName}</h2>
      <p className="text-xs text-even-ink/55">
        {tc("tableLabel", { table: tableNumber })} ·{" "}
        {format.dateTime(now, {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );

  const totalValue = paymentDetails?.installments
    ? `${paymentDetails.installments}x $${(amount / paymentDetails.installments).toFixed(2)} MXN`
    : amount > 0
      ? `$${Number(amount).toFixed(2)} MXN`
      : undefined;

  const totalRow = (animatedStamp: boolean) => (
    <>
      <ReceiptRow strong left={t("totalLabel")} right={totalValue} />
      {/* El sello cae en su propio espacio, sin tapar el importe */}
      <div className="relative h-14">
        <ReceiptStamp label={t("paidStamp")} animated={animatedStamp} />
      </div>
    </>
  );

  return (
    <>
      <div
        ref={collapsedRef}
        role="button"
        tabIndex={printed ? 0 : -1}
        aria-label={t("tapForDetail")}
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
            <ReceiptRow left={t("receiptItemsCount", { count: dishOrders.length })} />
          )}
          {card && <ReceiptRow left={card} />}
          <ReceiptRule />
          {totalRow(true)}
          <p
            className={`mt-3 text-center text-[11px] uppercase tracking-wider text-even-ink/45 transition-opacity duration-500 ${
              printed ? "opacity-100" : "opacity-0"
            }`}
          >
            {t("tapForDetail")}
          </p>
        </ReceiptPaper>
      </div>

      {open && from && (
        <ExpandedOverlay from={from} onClosed={() => setOpen(false)}>
          {(close) => (
            <ReceiptPaper mode="static">
              {title}
              <ReceiptRule />
              {paymentDetails?.userName && (
                <ReceiptRow left={paymentDetails.userName} />
              )}
              {card && <ReceiptRow left={card} />}

              {(dishOrders.length > 0 ||
                paymentType === "choose-amount" ||
                paymentType === "equal-shares") && (
                <>
                  <ReceiptRule />
                  <p className="pb-1 text-xs font-bold uppercase tracking-wider text-even-ink/55">
                    {tc("orderItems")}
                  </p>
                  {dishOrders.map((dish: any, index: number) => {
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
                            <ItemCustomizations
                              customFields={dish.custom_fields}
                              formatPrice={(price) =>
                                price * (lineTotal / (dish.total_price || 1))
                              }
                            />
                          </>
                        }
                      />
                    );
                  })}
                  {(paymentType === "choose-amount" || paymentType === "equal-shares") &&
                    paymentDetails?.baseAmount > 0 && (
                      <ReceiptRow
                        left={t("consumptionLabel").replace("+ ", "")}
                        right={`$${(
                          paymentDetails.displaySubtotal ??
                          paymentDetails.baseAmount +
                            (paymentDetails?.evenCommissionClient || 0) +
                            (paymentDetails?.ivaEvenClient || 0)
                        ).toFixed(2)}`}
                      />
                    )}
                </>
              )}

              {(paymentDetails?.tipAmount > 0 || !!paymentDetails?.installments) && (
                <>
                  <ReceiptRule />
                  {paymentDetails?.tipAmount > 0 ? (
                    <ReceiptRow
                      left={t("tipLabelPrefix").replace("+ ", "")}
                      right={`$${(paymentDetails.displayPropina ?? paymentDetails.tipAmount).toFixed(2)}`}
                    />
                  ) : null}
                  {paymentDetails?.installments ? (
                    <ReceiptRow
                      left={t("installmentsLabel", { months: paymentDetails.installments }).replace("+ ", "")}
                      right={`$${(
                        (paymentDetails.totalAmountCharged || 0) -
                        (paymentDetails.installmentBaseAmount || 0)
                      ).toFixed(2)}`}
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
                  {t("downloadTicketCta")}
                </ReceiptButton>
                {props.invoiceEnabled && (
                  <ReceiptButton onClick={props.onInvoice}>
                    <FileText className="size-4" />
                    {props.hasInvoice ? t("viewInvoiceCta") : tc("invoiceCta")}
                  </ReceiptButton>
                )}
                <button
                  onClick={close}
                  className="mt-1 py-2 text-xs font-medium uppercase tracking-wider text-even-ink/55 cursor-pointer"
                >
                  {t("closeCta")}
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
  const closingRef = useRef(false);

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

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
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
  };

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

"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Calendar,
  Download,
  FileText,
  Loader2,
  Utensils,
} from "lucide-react";
import { useRestaurant } from "@/context/RestaurantContext";
import {
  pickAndGoService,
  type ActiveOrderResponse,
} from "@/services/pickandgo.service";
import { invoiceService } from "@/services/invoice.service";
import { ticketService } from "@/services/ticket.service";
import { getCardTypeIcon } from "@/utils/cardIcons";
import ItemCustomizations from "@/components/ItemCustomizations";
import InvoiceModal from "@/components/modals/InvoiceModal";

type ActiveOrderData = NonNullable<ActiveOrderResponse["data"]>;

interface Props {
  order: ActiveOrderData;
  restaurantId: number;
  isAuthenticated: boolean;
}

/** Datos del pago guardados por la página de pago exitoso. */
function readPaymentDetails(orderId: string): any {
  try {
    const current = sessionStorage.getItem("even-current-payment-key");
    const raw =
      sessionStorage.getItem(`even-payment-success-${orderId}`) ??
      (current ? sessionStorage.getItem(current) : null);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Ticket de compra (segunda página del detalle del pedido). */
export default function OrderTicketSlide({
  order,
  restaurantId,
  isAuthenticated,
}: Props) {
  const t = useTranslations("PaymentSuccessPage");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const { restaurant } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;

  const orderId = String(order.pick_and_go_order?.id ?? "");
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(
    null,
  );
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setPaymentDetails(orderId ? readPaymentDetails(orderId) : null);
  }, [orderId]);

  const transactionId: string =
    paymentDetails?.transactionId || paymentDetails?.paymentId || orderId;

  // Items completos (con personalizaciones) del pedido
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    pickAndGoService
      .getOrder(orderId)
      .then((res) => {
        if (cancelled || !res.success || !res.data?.items) return;
        setItems(
          res.data.items.map((item: any) => ({
            id: item.id,
            item: item.item,
            quantity: item.quantity,
            total_price: item.price * item.quantity + (item.extra_price || 0),
            guest_name: item.guest_name,
            custom_fields: item.custom_fields,
            image_url: item.images?.[0] || null,
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // ¿Ya existe factura de esta transacción?
  useEffect(() => {
    if (!transactionId) return;
    invoiceService
      .getTransactionInvoice(transactionId)
      .then((info) => {
        if (info?.invoiceId) setExistingInvoiceId(info.invoiceId);
      })
      .catch(() => {});
  }, [transactionId]);

  const handleDownload = async () => {
    if (!transactionId || isDownloading) return;
    setIsDownloading(true);
    try {
      const blob = await ticketService.downloadTicketPdf(transactionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${transactionId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // se ignora en silencio
    } finally {
      setIsDownloading(false);
    }
  };

  const created = order.pick_and_go_order?.created_at
    ? new Date(order.pick_and_go_order.created_at)
    : new Date();
  const amount = Number(
    paymentDetails?.totalAmountCharged ??
      paymentDetails?.amount ??
      order.pick_and_go_order?.total_amount ??
      0,
  );
  const payerName =
    paymentDetails?.userName || order.pick_and_go_order?.customer_name;

  return (
    <div className="px-6 md:px-8 lg:px-10 pt-3 pb-6 md:pb-8 space-y-4 md:space-y-5">
      <div className="pt-1 space-y-2 md:space-y-3">
        <h4 className="font-medium text-lg md:text-xl text-white">
          {t("paymentDetailsTitle")}
        </h4>
        {payerName && (
          <div className="flex items-center gap-3 text-white/90">
            <div className="bg-warning-100 p-2 rounded-xl">
              <Utensils className="size-4 md:size-5 text-warning-600" />
            </div>
            <span className="text-sm md:text-base">{payerName}</span>
          </div>
        )}
        <div className="flex items-center gap-3 text-white/90">
          <div className="bg-info-100 p-2 rounded-xl">
            <Calendar className="size-4 md:size-5 text-info-600" />
          </div>
          <span className="text-sm md:text-base">
            {format.dateTime(created, {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
            })}
          </span>
        </div>
        {paymentDetails?.cardLast4 && (
          <div className="flex items-center gap-3 text-white/90">
            <div className="bg-positive-100 p-2 rounded-xl">
              <div className="size-4 md:size-5 flex items-center justify-center scale-150">
                {getCardTypeIcon(
                  paymentDetails.cardBrand || "unknown",
                  "medium",
                )}
              </div>
            </div>
            <span className="text-sm md:text-base">
              {paymentDetails.cardBrand === "apple"
                ? "Apple Pay"
                : paymentDetails.cardBrand === "google"
                  ? "Google Pay"
                  : `**** ${String(paymentDetails.cardLast4).slice(-4)}`}
            </span>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t border-white/20 pt-4 space-y-3">
          <h4 className="font-medium text-lg md:text-xl text-white">
            {tc("orderItems")}
          </h4>
          {items.map((dish) => (
            <div key={dish.id} className="flex items-center gap-3">
              {showImages && dish.image_url && (
                <img
                  src={dish.image_url}
                  alt={dish.item}
                  className="size-12 md:size-14 rounded-lg object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-base md:text-lg">
                  {dish.quantity}x {dish.item}
                </p>
                <ItemCustomizations
                  customFields={dish.custom_fields}
                  variant="dark"
                  className="mt-0.5"
                />
                {dish.guest_name && (
                  <p className="text-xs md:text-sm font-semibold text-white/80 uppercase">
                    {dish.guest_name}
                  </p>
                )}
              </div>
              <p className="text-white font-medium text-base md:text-lg">
                ${dish.total_price?.toFixed(2) || "0.00"} MXN
              </p>
            </div>
          ))}
          {paymentDetails?.tipAmount > 0 && (
            <div className="flex justify-between text-white font-medium text-base md:text-lg">
              <span>{tc("tip")}</span>
              <span>${paymentDetails.tipAmount.toFixed(2)} MXN</span>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-white/20 pt-4 flex justify-between items-center text-white font-medium text-lg md:text-xl">
        <span>{t("totalLabel")}</span>
        <span>${amount.toFixed(2)} MXN</span>
      </div>

      <div className="space-y-3">
        {restaurant?.billing_enabled !== false && (
          <button
            type="button"
            onClick={() => setIsInvoiceModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 md:py-4 rounded-full bg-even-grass text-even-evergreen font-medium text-base md:text-lg transition-all active:scale-95"
          >
            <FileText className="size-5 md:size-6" strokeWidth={1.8} />
            {existingInvoiceId ? t("viewInvoiceCta") : tc("invoiceCta")}
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2 border border-white/30 text-white rounded-2xl py-3 md:py-4 text-sm md:text-base hover:bg-white/10 transition-colors"
        >
          {isDownloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {t("downloadTicketCta")}
        </button>
      </div>

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        transactionId={transactionId}
        restaurantId={restaurantId}
        isAuthenticated={isAuthenticated}
        existingInvoiceId={existingInvoiceId}
        onInvoiceCreated={(id) => setExistingInvoiceId(id)}
      />
    </div>
  );
}

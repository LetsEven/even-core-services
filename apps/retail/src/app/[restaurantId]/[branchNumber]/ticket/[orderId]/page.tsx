"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CircleCheck, Download, FileText, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { InvoiceModal } from "@even/ui/diner";
import MenuHeader from "@/app/components/headers/MenuHeader";
import { useAuth } from "@/app/context/AuthContext";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { retailService } from "@/app/services/retail.service";
import { invoiceService } from "@/app/services/invoice.service";
import { ticketService } from "@/app/services/ticket.service";
import { dishTotal, type RetailOrder } from "@/app/types/order";

const IVA = 0.16;
const centavos = (n: number) => Math.round(n * 100) / 100;

// Ticket permanente de quien pagó: no depende de la orden activa de la sucursal
export default function RetailTicketPage() {
  const t = useTranslations("RetailTicket");
  const format = useFormatter();
  const params = useParams();
  const orderId = params?.orderId as string;
  const { isAuthenticated } = useAuth();
  const { restaurant } = useRestaurant();

  const [order, setOrder] = useState<RetailOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    retailService
      .getOrder(orderId)
      .then(setOrder)
      .catch((e) => setError(e instanceof Error ? e.message : t("notFound")));
  }, [orderId, t]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await ticketService.downloadTicketPdf(orderId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${order?.folio ?? orderId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("downloadError"));
    } finally {
      setDownloading(false);
    }
  };

  if (!order) {
    return (
      <div className="min-h-dvh bg-even-evergreen flex flex-col">
        <MenuHeader showBackButton={false} />
        <div className="flex-1 flex items-center justify-center px-8 text-center">
          {error ? (
            <p className="text-white">{error}</p>
          ) : (
            <Loader2 className="size-10 text-white animate-spin" />
          )}
        </div>
      </div>
    );
  }

  const total = centavos(Number(order.total_amount));
  const subtotal = centavos(total / (1 + IVA));
  const iva = centavos(total - subtotal);
  const paid = order.status === "paid";

  return (
    <div className="min-h-dvh bg-even-evergreen flex flex-col">
      <MenuHeader showBackButton={false} />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          <div className="py-6 md:py-8 px-8 md:px-10 flex flex-col items-center text-center">
            {paid && <CircleCheck className="size-12 text-even-grass mb-3" />}
            <h1 className="font-medium text-white text-3xl md:text-4xl">
              {paid ? t("paidTitle") : order.status === "cancelled" ? t("cancelledTitle") : t("pendingTitle")}
            </h1>
            <p className="text-white/60 mt-2 mb-6">{restaurant?.name ?? ""}</p>
          </div>
        </div>

        <div className="bg-white rounded-t-4xl flex-1 px-6 md:px-8 py-8 z-10">
          <div className="max-w-md mx-auto">
            <div className="flex justify-between text-sm text-tone-600 mb-4">
              <span>{t("orderLabel", { folio: order.folio ?? "—" })}</span>
              <span>
                {format.dateTime(new Date(order.paid_at ?? order.created_at), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>

            <div className="divide-y divide-stroke/50 border-y border-stroke/50">
              {order.items.map((d) => (
                <div key={d.id} className="flex justify-between gap-3 py-3 text-black">
                  <span>
                    {d.quantity} × <span className="capitalize">{d.item}</span>
                  </span>
                  <span className="shrink-0">${dishTotal(d).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 py-4 text-black">
              <Row label={t("subtotal")} value={subtotal} />
              <Row label={t("iva")} value={iva} />
              <Row label={t("total")} value={total} bold />
            </div>

            {paid && (
              <div className="space-y-2.5 mt-4">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="w-full flex items-center justify-center gap-2 bg-even-grass text-even-evergreen py-3 rounded-full cursor-pointer disabled:opacity-50"
                >
                  {downloading ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
                  {t("downloadCta")}
                </button>
                {restaurant?.billing_enabled !== false && (
                  <button
                    onClick={() => setInvoiceOpen(true)}
                    disabled={!!invoiceId}
                    className="w-full flex items-center justify-center gap-2 border border-black/50 bg-surface text-black py-3 rounded-full cursor-pointer disabled:opacity-50"
                  >
                    <FileText className="size-5" />
                    {invoiceId ? t("invoiceDone") : t("invoiceCta")}
                  </button>
                )}
              </div>
            )}

            {error && <p className="mt-4 text-sm text-danger-600 text-center">{error}</p>}
          </div>
        </div>
      </div>

      <InvoiceModal
        invoiceService={invoiceService}
        isOpen={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        transactionId={orderId}
        restaurantId={order.restaurant_id}
        isAuthenticated={isAuthenticated}
        existingInvoiceId={invoiceId}
        onInvoiceCreated={(id) => setInvoiceId(id)}
      />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-lg" : ""}`}>
      <span>{label}</span>
      <span>${value.toFixed(2)} MXN</span>
    </div>
  );
}

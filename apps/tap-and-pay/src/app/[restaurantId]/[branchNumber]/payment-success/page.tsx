"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { lockScroll, unlockScroll, useModalBackClose } from "@even/ui";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useRestaurant } from "@/app/context/RestaurantContext";
import InvoiceModal from "@/app/components/modals/InvoiceModal";
import PaidReceipt from "@/app/components/PaidReceipt";
import { invoiceService } from "@/app/services/invoice.service";
import { ticketService } from "@/app/services/ticket.service";
import { useAuth } from "@/app/context/AuthContext";

/**
 * Pago completado: el ticket de "PAGADO" (mismo que FlexBill, vive en @even/ui) con el
 * desglose al tocarlo, el agradecimiento y "Ir al pedido".
 */
export default function PaymentSuccessPage() {
  const t = useTranslations("PaymentSuccessPage");
  const { restaurant, setParams } = useRestaurant();
  const { isAuthenticated } = useAuth();
  const { state } = useTable();
  const { navigateWithTable, tableNumber } = useTableNavigation();
  const params = useParams();
  const searchParams = useSearchParams();

  // Establecer restaurantId y branchNumber desde los path params
  useEffect(() => {
    const restaurantId = params?.restaurantId as string;
    const branchNumber = params?.branchNumber as string;
    if (restaurantId && branchNumber) setParams({ restaurantId, branchNumber });
  }, [params, setParams]);

  const paymentId = searchParams.get("paymentId") || searchParams.get("orderId");
  const urlAmount = parseFloat(searchParams.get("amount") || "0");

  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);
  const [isDownloadingTicket, setIsDownloadingTicket] = useState(false);

  const transactionId = paymentDetails?.transactionId || paymentDetails?.paymentId || paymentId;

  const handleDownloadTicket = async () => {
    if (!transactionId || isDownloadingTicket) return;
    setIsDownloadingTicket(true);
    try {
      const blob = await ticketService.downloadTicketPdf(transactionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${transactionId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    } finally {
      setIsDownloadingTicket(false);
    }
  };

  // Sin scroll: el ticket y el botón caben en una sola vista
  useEffect(() => {
    lockScroll();
    return unlockScroll;
  }, []);

  // El pago ya se realizó: el back nativo no debe regresar a card-selection ni a las
  // pantallas previas del flujo de pago, sino a la cuenta.
  const navigateWithTableRef = useRef(navigateWithTable);
  navigateWithTableRef.current = navigateWithTable;
  useModalBackClose(true, () => navigateWithTableRef.current("/order", true));

  // Datos del pago: sessionStorage (ya vistos) o localStorage (primera vez, según el flujo de pago)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlPaymentId = paymentId || searchParams.get("transactionId");

    let stored: string | null = null;
    let fromSession = true;

    const currentKeyRef = sessionStorage.getItem("even-current-payment-key");
    if (currentKeyRef) stored = sessionStorage.getItem(currentKeyRef);

    if (!stored) {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith("even-payment-success-")) {
          stored = sessionStorage.getItem(key);
          break;
        }
      }
    }

    if (!stored) {
      fromSession = false;
      stored =
        localStorage.getItem("even-completed-payment") ||
        localStorage.getItem("even-pending-payment") ||
        localStorage.getItem("even-payment-intent");
    }

    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      setPaymentDetails(parsed);
      if (!fromSession) {
        const identifier = parsed.paymentId || parsed.transactionId || urlPaymentId || Date.now().toString();
        const uniqueKey = `even-payment-success-${identifier}`;
        sessionStorage.setItem(uniqueKey, stored);
        sessionStorage.setItem("even-current-payment-key", uniqueKey);
        localStorage.removeItem("even-pending-payment");
        localStorage.removeItem("even-payment-intent");
        localStorage.removeItem("even-completed-payment");
      }
    } catch (e) {
      console.error("Failed to parse stored payment details:", e);
    }
  }, [paymentId, searchParams]);

  // ¿Ya existe una factura para esta transacción?
  useEffect(() => {
    if (!transactionId) return;
    invoiceService
      .getTransactionInvoice(transactionId)
      .then((info) => {
        if (info?.invoiceId) setExistingInvoiceId(info.invoiceId);
      })
      .catch(() => {});
  }, [transactionId]);

  const amount = paymentDetails?.totalAmountCharged || paymentDetails?.amount || urlAmount;
  const paymentType = paymentDetails?.paymentType || "";

  // Platillos que cubre este pago (en dividir cuenta y elegir monto no se listan)
  const allDishOrders = paymentDetails?.dishOrders || [];
  const dishOrders =
    paymentType === "select-items"
      ? allDishOrders.filter((dish: any) =>
          (paymentDetails?.selectedItems || []).includes(dish.dish_order_id?.toString()),
        )
      : paymentType === "full-bill"
        ? allDishOrders
        : [];

  const handleGoToOrder = () => {
    const currentKey = sessionStorage.getItem("even-current-payment-key");
    if (currentKey) {
      sessionStorage.removeItem(currentKey);
      sessionStorage.removeItem("even-current-payment-key");
    }
    sessionStorage.removeItem("even-payment-success");
    navigateWithTable("/order");
  };

  return (
    <div className="brand-evergreen app-root flex h-dvh flex-col justify-center overflow-hidden">
      {/* Ticket que se imprime, se sella como PAGADO y se expande al tocarlo */}
      <div className="flex shrink-0 items-center justify-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 md:px-8">
        <div className="w-full max-w-xs md:max-w-sm">
          <PaidReceipt
            restaurantName={restaurant?.name || t("restaurantFallback")}
            tableNumber={state.tableNumber || tableNumber || "N/A"}
            paymentDetails={paymentDetails}
            paymentType={paymentType}
            amount={amount}
            dishOrders={dishOrders}
            onDownload={handleDownloadTicket}
            isDownloading={isDownloadingTicket}
            invoiceEnabled={restaurant?.billing_enabled !== false}
            hasInvoice={!!existingInvoiceId}
            onInvoice={() => setIsInvoiceModalOpen(true)}
          />
        </div>
      </div>

      {/* Agradecimiento + botón, justo debajo del ticket */}
      <div className="animate-slide-up mx-auto flex w-full max-w-md flex-col items-center gap-4 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:gap-5 md:px-8 lg:px-10">
        <h1 className="text-center text-3xl leading-tight font-medium text-white md:text-4xl lg:text-5xl">
          {t("heroTitle")}
        </h1>
        <button
          onClick={handleGoToOrder}
          className="w-full cursor-pointer rounded-full bg-even-grass py-3 text-base font-medium text-even-evergreen transition-all active:scale-90 md:py-4 md:text-lg lg:py-5 lg:text-xl"
        >
          {t("goToOrderCta")}
        </button>
      </div>

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        transactionId={transactionId || ""}
        restaurantId={restaurant?.id ?? 0}
        isAuthenticated={isAuthenticated}
        existingInvoiceId={existingInvoiceId}
        onInvoiceCreated={(id) => setExistingInvoiceId(id)}
      />
    </div>
  );
}

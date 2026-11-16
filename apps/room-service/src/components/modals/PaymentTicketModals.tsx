"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { lockScroll, unlockScroll } from "@even/ui";
import { Calendar, CircleAlert, Download, Loader2, Receipt, Utensils, X } from "lucide-react";
import InvoiceModal from "@/components/modals/InvoiceModal";
import { invoiceService } from "@/services/invoice.service";
import { ticketService } from "@/services/ticket.service";
import { roomOrderService as orderService } from "@/services/roomorders.service";
import { useRestaurant } from "@/context/RestaurantContext";
import { useRoom } from "@/context/RoomContext";
import { useAuth } from "@/context/AuthContext";
import { getCardTypeIcon } from "@/utils/cardIcons";

interface Props {
  ticketOpen: boolean;
  onCloseTicket: () => void;
  invoiceOpen: boolean;
  onCloseInvoice: () => void;
  /** Id del pedido recién pagado (si se conoce); si no, se toma el pago guardado en sesión. */
  orderId?: string | null;
}

/** Datos del pago guardados por la página de pago exitoso (sessionStorage). */
function readPaymentDetails(orderId?: string | null): any {
  try {
    const current = sessionStorage.getItem("even-current-payment-key");
    const raw =
      (orderId ? sessionStorage.getItem(`even-payment-success-${orderId}`) : null) ??
      (current ? sessionStorage.getItem(current) : null);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** ¿Hay un pago reciente del que mostrar ticket o facturar? */
export function hasRecentPayment(orderId?: string | null): boolean {
  return typeof window !== "undefined" && readPaymentDetails(orderId) !== null;
}

/** Ticket de compra y Facturar del último pago. Se abren desde el detalle del pedido / la cuenta. */
export default function PaymentTicketModals({
  ticketOpen,
  onCloseTicket,
  invoiceOpen,
  onCloseInvoice,
  orderId,
}: Props) {
  const t = useTranslations("PaymentSuccessPage");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const { restaurant } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;
  const { state } = useRoom();
  const { isAuthenticated } = useAuth();

  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [dishOrders, setDishOrders] = useState<any[]>([]);
  const [orderCreatedAt, setOrderCreatedAt] = useState<Date | null>(null);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);
  const [isDownloadingTicket, setIsDownloadingTicket] = useState(false);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const open = ticketOpen || invoiceOpen;

  useEffect(() => {
    if (open) setPaymentDetails(readPaymentDetails(orderId));
  }, [open, orderId]);

  useEffect(() => {
    if (ticketOpen || isBreakdownModalOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [ticketOpen, isBreakdownModalOpen]);

  // Calculate total amount charged to client
  const amount = paymentDetails?.totalAmountCharged || paymentDetails?.amount || 0;
  const itemsSubtotal = useMemo(
    () =>
      dishOrders.reduce((sum, dish: any) => {
        const unitPrice = (dish.price || 0) + (dish.extra_price || 0);
        const quantity = dish.quantity || 1;
        if (unitPrice <= 0) return sum;
        return sum + Math.round(unitPrice * quantity * 100) / 100;
      }, 0),
    [dishOrders],
  );
  const subtotal = paymentDetails?.baseAmount || itemsSubtotal;
  const serviceCharge =
    (paymentDetails?.evenCommissionClient || 0) + (paymentDetails?.ivaEvenClient || 0);

  useEffect(() => {
    if (!paymentDetails) return;
    let cancelled = false;
    const load = async () => {
      const id = orderId || paymentDetails.orderId;
      if (id) {
        try {
          const result = await orderService.getOrderById(id);
          if (result.success && result.data) {
            const orderData = (result.data as any)?.data || result.data;
            if (orderData?.room_order?.created_at && !cancelled) {
              setOrderCreatedAt(new Date(orderData.room_order.created_at));
            }
            if (orderData?.dishes?.length) {
              if (!cancelled) {
                setDishOrders(
                  orderData.dishes.map((d: any) => ({
                    dish_order_id: d.menu_item_id || d.id,
                    item: d.item,
                    quantity: d.quantity,
                    price: d.price,
                    extra_price: d.extra_price || 0,
                    total_price: d.total_price ?? (d.price + (d.extra_price || 0)) * d.quantity,
                    guest_name: d.guest_name || null,
                    custom_fields: d.custom_fields || null,
                    images: d.images || (d.image_url ? [d.image_url] : []),
                  })),
                );
              }
              return;
            }
          }
        } catch {
          // cae al respaldo guardado en sesión
        }
      }
      if (!cancelled) setDishOrders(paymentDetails.dishOrders || []);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [paymentDetails, orderId]);

  useEffect(() => {
    const txId = paymentDetails?.transactionId || paymentDetails?.paymentId;
    if (!txId) return;
    invoiceService
      .getTransactionInvoice(txId)
      .then((info) => {
        if (info?.invoiceId && info.status !== "cancelled") {
          setExistingInvoiceId(info.invoiceId);
        }
      })
      .catch(() => {});
  }, [paymentDetails]);

  const handleDownloadTicket = async () => {
    const transactionId = paymentDetails?.transactionId || paymentDetails?.paymentId;
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

  if (!open && !isBreakdownModalOpen) return null;

  return (
    <>
      {ticketOpen && (
        <>
<div className="fixed inset-0 bg-black/25 backdrop-blur-xs z-999" onClick={() => onCloseTicket()} />
<div className="fixed inset-0 z-999 flex items-center justify-center pointer-events-none">
          <div
            className="pointer-events-auto bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-999  max-h-[77vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-end shrink-0">
              <button
                onClick={() => onCloseTicket()}
                className="p-2 md:p-3 lg:p-4 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors justify-end flex items-end mt-3 md:mt-4 lg:mt-5 mr-3 md:mr-4 lg:mr-5"
              >
                <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
              </button>
            </div>
            <div className="px-6 md:px-8 lg:px-10 flex items-center justify-center mb-4 md:mb-5 lg:mb-6 shrink-0">
              <div className="flex flex-col justify-center items-center gap-3 md:gap-4 lg:gap-5">
                {restaurant?.logo_url ? (
                  <img
                    src={restaurant.logo_url}
                    alt={restaurant.name}
                    className="size-20 md:size-24 lg:size-28 object-cover rounded-lg md:rounded-xl"
                  />
                ) : (
                  <Receipt className="size-20 md:size-24 lg:size-28 text-white" />
                )}
                <div className="flex flex-col items-center justify-center">
                  <h2 className="text-xl md:text-2xl lg:text-3xl text-white font-bold">
                    {restaurant?.name || t("defaultRestaurantName")}
                  </h2>
                  <p className="text-sm md:text-base lg:text-lg text-white/80">
                    {tc("roomLabel", {
                      room: paymentDetails?.roomNumber || state.roomNumber,
                    })}
                  </p>
                  <p className="text-xs md:text-sm text-white/70 mt-1">
                    {format.dateTime(orderCreatedAt || new Date(), {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable Content - Detalles del pago + Items de la orden */}
            <div className="px-6 md:px-8 lg:px-10 space-y-4 md:space-y-5 lg:space-y-6 overflow-y-auto flex-1 min-h-0">
              {/* Order Info */}
              <div className="border-t border-white/20 pt-4 md:pt-5 lg:pt-6">
                <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white mb-3 md:mb-4 lg:mb-5">
                  {t("paymentDetailsTitle")}
                </h3>
                <div className="space-y-2 md:space-y-3 lg:space-y-4">
                  {paymentDetails?.userName && (
                    <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                      <div className="bg-warning-100 p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                        <Utensils className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-warning-600" />
                      </div>
                      <span className="text-sm md:text-base lg:text-lg">
                        {paymentDetails.userName}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                    <div className="bg-info-100 p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                      <Calendar className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-info-600" />
                    </div>
                    <span className="text-sm md:text-base lg:text-lg">
                      {format.dateTime(orderCreatedAt || new Date(), {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })}
                    </span>
                  </div>

                  {paymentDetails?.cardLast4 && (
                    <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-white/90">
                      <div className="bg-positive-100 p-2 md:p-2.5 lg:p-3 rounded-xl flex items-center justify-center">
                        <div className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 flex items-center justify-center scale-150">
                          {getCardTypeIcon(
                            paymentDetails.cardBrand || "unknown",
                            "medium",
                          )}
                        </div>
                      </div>
                      <span className="text-sm md:text-base lg:text-lg">
                        {paymentDetails.cardBrand === "apple"
                          ? "Apple Pay"
                          : paymentDetails.cardBrand === "google"
                            ? "Google Pay"
                            : `**** ${paymentDetails.cardLast4.slice(-4)}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Items */}
              {dishOrders.length > 0 && (
                <div className="border-t border-white/20 py-4 md:py-5 lg:py-6">
                  <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white mb-3 md:mb-4 lg:mb-5">
                    {tc("orderItems")}
                  </h3>
                  <div className="space-y-3 md:space-y-4 lg:space-y-5 pb-4 md:pb-5 lg:pb-6">
                    {dishOrders.map((dish: any, index: number) => {
                      // Calcular el precio total correcto: (precio base + extras) * cantidad
                      const itemPrice = dish.price || 0;
                      const extraPrice = dish.extra_price || 0;
                      const quantity = dish.quantity || 1;
                      const calculatedTotal =
                        (itemPrice + extraPrice) * quantity;

                      return (
                        <div
                          key={`${dish.dish_order_id || "dish"}-${index}-${dish.item}`}
                          className="flex justify-between items-center gap-3 md:gap-4 lg:gap-5"
                        >
                          {showImages && dish.images &&
                            dish.images.length > 0 &&
                            dish.images[0] && (
                              <img
                                src={dish.images[0]}
                                alt={dish.item}
                                className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-lg object-cover"
                              />
                            )}
                          <div className="flex-1">
                            <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                              {quantity}x {dish.item}
                            </p>
                            {dish.guest_name && (
                              <p className="text-xs md:text-sm lg:text-base text-white/60 uppercase">
                                {dish.guest_name}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                              ${calculatedTotal.toFixed(2)} MXN
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Propina como item */}
                    {paymentDetails?.tipAmount > 0 && (
                      <div className="flex justify-between items-start gap-3 md:gap-4 lg:gap-5 pt-3 md:pt-4 lg:pt-5">
                        <div className="flex-1">
                          <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                            {tc("tip")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-medium text-base md:text-lg lg:text-xl">
                            ${paymentDetails.tipAmount.toFixed(2)} MXN
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Total Summary - Fixed */}
            <div className="px-6 md:px-8 lg:px-10 shrink-0">
              <div className="flex justify-between items-center border-t border-white/20 pt-4 md:pt-5 lg:pt-6 mb-2">
                <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
                  <span className="text-lg md:text-xl lg:text-2xl font-medium text-white">
                    {t("totalLabel")}
                  </span>
                  <button
                    onClick={() => setIsBreakdownModalOpen(true)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors"
                    aria-label={t("viewBreakdownAlt")}
                  >
                    <CircleAlert
                      className="size-4 md:size-5 lg:size-6 cursor-pointer text-white/70"
                      strokeWidth={2.3}
                    />
                  </button>
                </div>
                {paymentDetails?.installments ? (
                  <span className="text-lg md:text-xl lg:text-2xl font-medium text-white">
                    {paymentDetails.installments}x $
                    {(amount / paymentDetails.installments).toFixed(2)} MXN
                  </span>
                ) : (
                  <span className="text-lg md:text-xl lg:text-2xl font-medium text-white">
                    ${amount.toFixed(2)} MXN
                  </span>
                )}
              </div>
              <button
                onClick={handleDownloadTicket}
                className="w-full flex items-center justify-center gap-2 border border-white/30 text-white rounded-2xl py-3 md:py-4 text-sm md:text-base hover:bg-white/10 transition-colors mb-6 md:mb-8 lg:mb-10"
              >
                {isDownloadingTicket ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {t("downloadTicketCta")}
              </button>
            </div>
          </div>
        </div>
</>
      )}

      {isBreakdownModalOpen && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 99999 }}
        >
          {/* Fondo */}
          <div
            className="absolute inset-0 bg-black/25"
            onClick={() => setIsBreakdownModalOpen(false)}
          ></div>

          {/* Modal */}
          <div className="relative bg-white rounded-t-4xl w-full mx-4 md:mx-6 lg:mx-8">
            {/* Titulo */}
            <div className="px-6 md:px-8 lg:px-10 pt-4 md:pt-6 lg:pt-8">
              <div className="flex items-center justify-between pb-4 md:pb-5 lg:pb-6 border-b border-stroke">
                <h3 className="text-lg md:text-xl lg:text-2xl font-semibold text-black">
                  {t("breakdownTitle")}
                </h3>
                <button
                  onClick={() => setIsBreakdownModalOpen(false)}
                  className="p-1 hover:bg-tone-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="size-5 md:size-6 lg:size-7 text-tone-500" />
                </button>
              </div>
            </div>

            {/* Contenido */}
            <div className="px-6 md:px-8 lg:px-10 py-4 md:py-6 lg:py-8">
              <p className="text-black text-base md:text-lg lg:text-xl mb-4 md:mb-5 lg:mb-6">
                {t("breakdownIntro")}
              </p>
              <div className="space-y-3 md:space-y-4 lg:space-y-5">
                {paymentDetails?.baseAmount && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("consumptionLabel")}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      ${paymentDetails.baseAmount.toFixed(2)} MXN
                    </span>
                  </div>
                )}

                {paymentDetails?.tipAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("tipLabelPrefix")}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      ${paymentDetails.tipAmount.toFixed(2)} MXN
                    </span>
                  </div>
                )}

                {(paymentDetails?.evenCommissionClient || 0) +
                  (paymentDetails?.ivaEvenClient || 0) >
                  0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("serviceCommissionLabel")}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      $
                      {(
                        (paymentDetails?.evenCommissionClient || 0) +
                        (paymentDetails?.ivaEvenClient || 0)
                      ).toFixed(2)}{" "}
                      MXN
                    </span>
                  </div>
                )}

                {paymentDetails?.installments && (
                  <div className="flex justify-between items-center">
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      {t("installmentsLabel", {
                        months: paymentDetails.installments,
                      })}
                    </span>
                    <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                      $
                      {(
                        (paymentDetails.totalAmountCharged || 0) -
                        (paymentDetails.installmentBaseAmount || 0)
                      ).toFixed(2)}{" "}
                      MXN
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <InvoiceModal
        isOpen={invoiceOpen}
        onClose={onCloseInvoice}
        transactionId={paymentDetails?.transactionId || paymentDetails?.paymentId || ""}
        restaurantId={restaurant?.id ?? 0}
        isAuthenticated={isAuthenticated}
        onInvoiceCreated={(id) => setExistingInvoiceId(id)}
        existingInvoiceId={existingInvoiceId}
      />
    </>
  );
}

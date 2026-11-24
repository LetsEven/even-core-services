"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, CircleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  buildChargeRequest,
  computeMsiTotal,
  readTableChargeBlock,
  toTransactionRecord,
} from "@even/payments";
import {
  useSavedCardCharge,
  useWalletHold,
  useWalletPayments,
} from "@even/payments/react";
import { useRetailOrder } from "@/app/context/RetailOrderContext";
import { useBranchNavigation } from "@/app/hooks/useBranchNavigation";
import { usePayment } from "@/app/context/PaymentContext";
import { useAuth } from "@/app/context/AuthContext";
import { useGuest } from "@/app/context/GuestContext";
import MenuHeader from "@/app/components/headers/MenuHeader";
import OrderAnimation from "@/app/components/UI/OrderAnimation";
import { paymentService } from "@/app/services/payment.service";
import { getCardTypeIcon } from "@/app/utils/cardIcons";
import { useMsiConfig } from "@/app/hooks/useMsiConfig";
import { useModalBackClose } from "@/app/hooks/useModalBackClose";
import { clearStoredPaymentIntent } from "@/app/utils/paymentIdempotency";
import { calculateCommissions, COMMISSION_SERVICE } from "@/app/utils/commissionCalculator";

export default function RetailCheckoutPage() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  const { charge: chargeCard } = useSavedCardCharge({
    paymentService,
    extractOrderId: (r) => r.payment?.id || (r as { order?: { id?: string } }).order?.id,
  });
  const { order, loading: orderLoading, reload } = useRetailOrder();
  const { navigate, restaurantId } = useBranchNavigation();
  const { paymentMethods, deletePaymentMethod } = usePayment();
  const { user, profile, isLoading: authLoading } = useAuth();
  const { guestName } = useGuest();
  const { msiConfig } = useMsiConfig();

  // Tarjeta de prueba: SOLO detrás de NEXT_PUBLIC_SHOW_TEST_CARD (apagado en producción)
  const showTestCard = process.env.NEXT_PUBLIC_SHOW_TEST_CARD === "true";
  const defaultSystemCard = {
    id: "system-default-card",
    lastFourDigits: "1234",
    cardBrand: "amex",
    cardType: "credit",
    isDefault: true,
    isSystemCard: true,
  };
  const allPaymentMethods = showTestCard ? [defaultSystemCard, ...paymentMethods] : paymentMethods;

  // Retail se paga completo y sin propina: el monto sale de la orden, no de la URL
  const orderId = order?.status === "pending" ? order.id : null;
  const baseAmount = orderId ? Number(order!.total_amount) : 0;
  const tipAmount = 0;
  const commissions = calculateCommissions(baseAmount, tipAmount);
  const totalAmountCharged = commissions.totalAmountCharged;

  const displayName = user?.id
    ? `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim() || "Usuario"
    : (guestName || "").trim() || "Invitado";

  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [showPaymentAnimation, setShowPaymentAnimation] = useState(false);
  const [showPaymentOptionsModal, setShowPaymentOptionsModal] = useState(false);
  const [selectedMSI, setSelectedMSI] = useState<number | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>(t("processingErrorTitle"));
  // false cuando no hay certeza de que no se cobró: no se ofrece reintentar
  const [canRetryCharge, setCanRetryCharge] = useState(true);
  // La orden ya no se puede pagar desde aquí (otro la pagó o crew la canceló)
  const [ordenCambio, setOrdenCambio] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // Se llena solo cuando el cobro y su registro quedaron confirmados
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);

  // Sin orden pendiente no hay nada que cobrar (salvo en pleno pago)
  useEffect(() => {
    if (orderLoading || showPaymentAnimation || verifying || payingOrderId) return;
    if (!orderId) navigate("/order", true);
  }, [orderLoading, orderId, showPaymentAnimation, verifying, payingOrderId, navigate]);

  useEffect(() => {
    if (!selectedPaymentMethodId && allPaymentMethods.length > 0) {
      const def = allPaymentMethods.find((pm) => pm.isDefault) || allPaymentMethods[0];
      setSelectedPaymentMethodId(def.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo elige la tarjeta por defecto al cargar
  }, [allPaymentMethods.length]);

  const mostrarOrdenCambio = (title: string, message: string) => {
    setOrdenCambio(true);
    setErrorTitle(title);
    setErrorMessage(message);
  };

  // Rechazo antes del cargo: alguien más la está pagando, o ya se cerró
  const avisarSiOrdenBloqueada = async (result: unknown) => {
    const block = readTableChargeBlock(result);
    // Crew editó la orden después de que el comensal vio el total: no se cobró
    if (block?.kind === "order_changed") {
      await reload();
      mostrarOrdenCambio(t("orderChangedTitle"), t("orderChangedMessage"));
      return true;
    }
    if (block?.kind === "cuenta_apartada") {
      mostrarOrdenCambio(t("accountHeldTitle"), t("accountHeldMessage", { amount: block.heldByOthers.toFixed(2) }));
      return true;
    }
    const fresh = await reload();
    if (!fresh || fresh.id !== orderId) {
      mostrarOrdenCambio(t("orderChangedTitle"), t("orderChangedMessage"));
      return true;
    }
    return false;
  };

  const walletHold = useWalletHold({
    accountId: orderId,
    release: (id) => paymentService.releaseWalletHold({ id_retail_order: id }),
    onExpired: () =>
      mostrarOrdenCambio(t("walletExpiredTitle"), t("walletExpiredMessage")),
  });
  const walletVencido = walletHold.expired;

  const startAnimation = () => {
    setConfirmedOrderId(null);
    setPayingOrderId(orderId);
    setShowPaymentAnimation(true);
  };

  const {
    applePayReady,
    applePayUnavailable,
    walletOrderRejected,
    isApplePayProcessing,
    setIsApplePayProcessing,
    applePayPaymentId,
    googlePayReady,
    googlePayUnavailable,
    isGooglePayProcessing,
    setIsGooglePayProcessing,
    googlePayPaymentId,
  } = useWalletPayments({
    paymentService,
    canCreateOrders: !!orderId && totalAmountCharged > 0,
    orderKey: [orderId, totalAmountCharged].join("|"),
    amount: totalAmountCharged,
    prepareOrder: () => ({
      fingerprint: { items: [], tipAmount, discountId: null, total: totalAmountCharged },
      request: {
        amount: totalAmountCharged,
        currency: "MXN",
        restaurantId: restaurantId as string,
        baseAmount,
        tipAmount,
        service: COMMISSION_SERVICE,
        id_retail_order: orderId ?? undefined,
      },
    }),
    apple: { detection: "once", label: "Even" },
    // Mismo estado que Tap & Pay: Google Pay apagado por los problemas del 13-nov.
    google: { paymentId: "activity_id", disabled: true },
    onOrderRejected: (_provider, rejection) => void avisarSiOrdenBloqueada(rejection),
    onOrderCreated: () => walletHold.markHeld(),
    onApplePaySuccess: () => {
      walletHold.markPaid();
      startAnimation();
    },
    onGooglePaySuccess: () => {
      walletHold.markPaid();
      startAnimation();
    },
    onGooglePayPaymentError: () => {
      setCanRetryCharge(true);
      setErrorTitle(t("googlePayErrorTitle"));
      setErrorMessage(t("googlePayErrorMessage"));
    },
  });

  const selectedMethod = allPaymentMethods.find((pm) => pm.id === selectedPaymentMethodId);
  const msiOptions = selectedMethod?.cardBrand === "amex" ? msiConfig.amex : msiConfig.visaMc;
  const msiOption = selectedMSI === null ? null : msiOptions.find((o) => o.months === selectedMSI);
  const displayTotal = msiOption ? computeMsiTotal(totalAmountCharged, msiOption.rate) : totalAmountCharged;

  const resetAfterError = () => {
    setShowPaymentAnimation(false);
    setVerifying(false);
    setIsProcessing(false);
    setPayingOrderId(null);
    setConfirmedOrderId(null);
    setIsApplePayProcessing(false);
    setIsGooglePayProcessing(false);
  };

  // Corre al terminar la ventana de cancelación de OrderAnimation: aquí se cobra de verdad
  const handleConfirmPayment = async () => {
    const paidOrderId = payingOrderId;
    if (!paidOrderId) return;
    let chargeSucceeded = false;

    try {
      const isWallet = isApplePayProcessing || isGooglePayProcessing;
      const isTestCard = selectedPaymentMethodId === "system-default-card";
      const isRealCardPayment = !isWallet && !isTestCard;
      let chargeEcartpayOrderId: string | null = null;
      chargeSucceeded = !isRealCardPayment;

      if (isRealCardPayment) {
        if (!selectedMethod) throw new Error(t("errorCardNotFound"));
        const outcome = await chargeCard({
          fingerprintInput: { items: [], tipAmount, discountId: null, total: totalAmountCharged },
          onVerifying: () => {
            setShowPaymentAnimation(false);
            setVerifying(true);
          },
          request: buildChargeRequest({
            service: COMMISSION_SERVICE,
            paymentMethodId: selectedMethod.id,
            amount: totalAmountCharged,
            description: `Even Retail - Orden ${order?.folio ?? ""}`.trim(),
            orderId: paidOrderId,
            restaurantId: restaurantId as string,
            installments: selectedMSI,
            baseAmount,
            tipAmount,
            order: { id_retail_order: paidOrderId },
            payerName: displayName,
          }),
        });

        if (outcome.status === "unconfirmed") {
          resetAfterError();
          setCanRetryCharge(false);
          setErrorTitle(t("confirmFailedTitle"));
          setErrorMessage(
            outcome.reason === "in_progress_timeout"
              ? t("confirmFailedMessageAfterTimeout")
              : t("confirmFailedMessageUnknown"),
          );
          return;
        }

        if (outcome.status === "retryable") {
          resetAfterError();
          setCanRetryCharge(true);
          if (outcome.reason === "idempotency_unavailable") {
            setErrorTitle(t("retryTitle"));
            setErrorMessage(t("retryShortMessage"));
            return;
          }
          if (outcome.reason === "missing_order_id") throw new Error(t("errorProviderNotConfirmed"));
          // Nunca se cobró: si la orden ya no está pendiente, regresar a la orden
          if (await avisarSiOrdenBloqueada({ code: outcome.reason })) return;
          setErrorTitle(
            outcome.reason === "payment_rejected" ? t("paymentRejectedTitle") : t("processingErrorTitle"),
          );
          setErrorMessage(outcome.message || t("paymentRejectedMessage"));
          return;
        }

        chargeEcartpayOrderId = outcome.ecartpayOrderId;
        chargeSucceeded = true;
      }

      // El backend cierra la orden, la manda al POS e imprime el ticket al registrar
      const result = await paymentService.recordPaymentTransaction(
        toTransactionRecord({
          breakdown: commissions,
          chargedTotal: displayTotal,
          paymentMethodId: isWallet || isTestCard ? null : selectedPaymentMethodId,
          restaurantId: parseInt(restaurantId as string, 10),
          ecartpayOrderId: isApplePayProcessing
            ? applePayPaymentId
            : isGooglePayProcessing
              ? googlePayPaymentId
              : chargeEcartpayOrderId,
          paymentSource: isApplePayProcessing
            ? "apple_pay"
            : isGooglePayProcessing
              ? "google_pay"
              : isRealCardPayment
                ? "saved_card"
                : null,
          transactionBy: displayName,
          order: { id_retail_order: paidOrderId },
        }),
      );
      if (!result.success) throw new Error(result.error?.message || t("errorUnknown"));

      clearStoredPaymentIntent();
      setConfirmedOrderId(paidOrderId);
    } catch (error) {
      resetAfterError();
      if (chargeSucceeded) {
        // Ya se cobró: reintentar podría cobrar dos veces
        setCanRetryCharge(false);
        setErrorTitle(t("confirmFailedTitle"));
        setErrorMessage(t("confirmFailedMessageChargedNotRecorded"));
      } else {
        setCanRetryCharge(true);
        setErrorMessage(error instanceof Error ? error.message : t("errorUnknown"));
      }
    }
  };

  const goToTicket = (id: string) => navigate(`/ticket/${id}`, true);

  const handlePayment = () => {
    if (isProcessing || !orderId) return;
    if (!selectedPaymentMethodId) {
      setErrorMessage(t("errorSelectPaymentMethod"));
      return;
    }
    if (selectedPaymentMethodId === "system-default-card" && !showTestCard) return;
    setIsProcessing(true);
    startAnimation();
  };

  // Si el pago se confirma mientras se muestra "Verificando…", ir directo al ticket
  useEffect(() => {
    if (verifying && confirmedOrderId) {
      setVerifying(false);
      goToTicket(confirmedOrderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goToTicket es estable en la práctica
  }, [verifying, confirmedOrderId]);

  useEffect(() => {
    if (errorMessage) setVerifying(false);
  }, [errorMessage]);

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm(t("confirmDeleteCardMessage"))) return;
    setDeletingCardId(cardId);
    try {
      await deletePaymentMethod(cardId);
      if (selectedPaymentMethodId === cardId) setSelectedPaymentMethodId(null);
    } catch {
      setErrorTitle(t("deleteCardErrorTitle"));
      setErrorMessage(t("deleteCardErrorMessage"));
    } finally {
      setDeletingCardId(null);
    }
  };

  const closeError = () => {
    if (walletVencido || ordenCambio) {
      // Al cerrarse, el modal hace history.back() para quitar su entrada: se navega
      // después de ese back, o lo deshace. Si ya se cerró con el back del teléfono, directo.
      const guardArriba =
        (window.history.state as { evenModalGuard?: number } | null)?.evenModalGuard !== undefined;
      if (guardArriba) {
        window.addEventListener("popstate", () => navigate("/order", true), { once: true });
      }
      setErrorMessage(null);
      setOrdenCambio(false);
      if (!guardArriba) navigate("/order", true);
      return;
    }
    setErrorMessage(null);
    setErrorTitle(t("processingErrorTitle"));
  };

  useModalBackClose(showPaymentOptionsModal, () => setShowPaymentOptionsModal(false));
  useModalBackClose(!!errorMessage, closeError);

  if (orderLoading || authLoading) {
    return (
      <div className="min-h-dvh bg-even-evergreen flex flex-col">
        <MenuHeader />
        <div className="w-full flex-1 flex items-center justify-center">
          <Loader2 className="size-10 text-white animate-spin" />
        </div>
      </div>
    );
  }

  const payDisabled = isProcessing || !selectedPaymentMethodId || totalAmountCharged <= 0;

  return (
    <>
      {showPaymentAnimation && (
        <OrderAnimation
          userName={profile?.firstName || displayName}
          orderedItems={order?.items ?? []}
          orderId={confirmedOrderId}
          onContinue={() => confirmedOrderId && goToTicket(confirmedOrderId)}
          onCancel={() => {
            setShowPaymentAnimation(false);
            setIsProcessing(false);
            setPayingOrderId(null);
            setConfirmedOrderId(null);
          }}
          onConfirm={handleConfirmPayment}
          onTimeout={() => {
            setShowPaymentAnimation(false);
            setVerifying(true);
          }}
        />
      )}

      {/* El cobro sigue corriendo en segundo plano: sin cancelar ni reintentar */}
      {verifying && (
        <div className="fixed inset-0 z-9999 bg-white flex flex-col items-center justify-center px-8 text-center gap-6">
          <Loader2 className="size-12 text-even-evergreen animate-spin" />
          <div>
            <h2 className="text-xl font-medium text-black mb-2">{t("verifyingPaymentTitle")}</h2>
            <p className="text-sm text-tone-500 max-w-xs">{t("verifyingPaymentMessage")}</p>
          </div>
        </div>
      )}

      <div className="min-h-dvh bg-even-evergreen flex flex-col">
        <MenuHeader />

        <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
          <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
            <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
              <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
                {t("selectPaymentMethodTitle")}
              </h1>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white rounded-t-4xl flex-1 flex flex-col px-6 md:px-8 lg:px-10 overflow-hidden z-10">
              <div className="flex-1 overflow-y-auto py-8 pb-30">
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                      {tc("totalToPay")}
                    </span>
                    <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                      {selectedMSI !== null
                        ? `$${(displayTotal / selectedMSI).toFixed(2)} MXN ${t("monthsSuffix", { months: selectedMSI })}`
                        : `$${displayTotal.toFixed(2)} MXN`}
                    </span>
                  </div>

                  {selectedMethod?.cardType === "credit" && msiConfig.isActive && totalAmountCharged >= 300 && (
                    <div className="py-2 cursor-pointer" onClick={() => setShowPaymentOptionsModal(true)}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                          {t("payInMonths")}
                        </span>
                        <Radio checked={selectedMSI !== null} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="mb-2.5">
                  <h3 className="text-black font-medium mb-3">{t("paymentMethodsLabel")}</h3>
                  <div className="space-y-2.5">
                    {allPaymentMethods.map((method) => (
                      <div
                        key={method.id}
                        className={`flex items-center py-1.5 px-5 pl-10 border rounded-full transition-colors ${
                          selectedPaymentMethodId === method.id
                            ? "border-even-grass bg-even-grass/10"
                            : "border-black/50 bg-surface"
                        }`}
                      >
                        <div
                          onClick={() => setSelectedPaymentMethodId(method.id)}
                          className="flex items-center justify-center gap-3 mx-auto cursor-pointer text-base md:text-lg lg:text-xl"
                        >
                          <div>{getCardTypeIcon(method.cardBrand)}</div>
                          <p className="text-black">**** {method.lastFourDigits}</p>
                        </div>
                        <div onClick={() => setSelectedPaymentMethodId(method.id)} className="cursor-pointer">
                          <Radio checked={selectedPaymentMethodId === method.id} />
                        </div>
                        {!("isSystemCard" in method && method.isSystemCard) && (
                          <button
                            onClick={() => handleDeleteCard(method.id)}
                            disabled={deletingCardId === method.id}
                            className="pl-2 text-tone-400 hover:text-danger-600 transition-colors disabled:opacity-50 cursor-pointer"
                            title={t("deleteCardButtonTitle")}
                          >
                            {deletingCardId === method.id ? (
                              <Loader2 className="size-5 animate-spin" />
                            ) : (
                              <Trash2 className="size-5" />
                            )}
                          </button>
                        )}
                      </div>
                    ))}

                    {walletOrderRejected && (
                      <p className="text-sm text-tone-600 text-center">{t("walletUnavailableMessage")}</p>
                    )}

                    {!applePayUnavailable && !walletVencido && (
                      <div className="relative w-full h-12">
                        <div id="apple-pay-container" className="w-full" />
                        {!applePayReady && (
                          <div className="absolute inset-0 rounded-full bg-black flex items-center justify-center gap-2">
                            <span className="text-white font-medium text-base tracking-wide">Pay</span>
                            <Loader2 className="size-4 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                    )}

                    {!googlePayUnavailable && !walletVencido && (
                      <div className="relative w-full h-12">
                        <div id="google-pay-container" className="w-full" />
                        {!googlePayReady && (
                          <div className="absolute inset-0 rounded-full bg-black flex items-center justify-center gap-2">
                            <span className="text-white font-medium text-base tracking-wide">G Pay</span>
                            <Loader2 className="size-4 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-2.5">
                  <button
                    onClick={() => navigate("/add-card")}
                    className="border border-black/50 flex justify-center items-center gap-1 w-full text-black py-3 rounded-full cursor-pointer transition-colors bg-surface hover:bg-tone-100 text-base md:text-lg lg:text-xl"
                  >
                    <Plus className="size-5" />
                    {t("addPaymentMethodCta")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="fixed bottom-0 left-0 right-0 bg-white mx-4 px-8 z-90 py-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={handlePayment}
            disabled={payDisabled}
            className={`w-full py-3 text-even-evergreen rounded-full cursor-pointer transition-colors text-base md:text-lg lg:text-xl active:scale-90 bg-even-grass ${
              payDisabled ? "opacity-50 cursor-not-allowed" : "animate-pulse-button"
            }`}
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-5 animate-spin" />
                {t("processingCta")}
              </span>
            ) : !selectedPaymentMethodId ? (
              t("selectCardCta")
            ) : (
              tc("payCta")
            )}
          </button>
        </div>

        {showPaymentOptionsModal && (
          <div className="fixed inset-0 flex items-end justify-center backdrop-blur-sm" style={{ zIndex: 99999 }}>
            <div className="absolute inset-0 bg-black/20" onClick={() => setShowPaymentOptionsModal(false)} />
            <div className="relative bg-white rounded-t-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="px-6 pt-4 sticky top-0 bg-white z-10">
                <div className="flex items-center justify-between pb-4 border-b border-stroke">
                  <h3 className="text-lg font-semibold text-black">{t("paymentOptionsTitle")}</h3>
                  <button
                    onClick={() => setShowPaymentOptionsModal(false)}
                    className="p-1 hover:bg-tone-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="size-5 text-tone-500" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-4 space-y-2.5">
                <MsiRow
                  title={t("fullPaymentOption")}
                  detail={`$${totalAmountCharged.toFixed(2)} MXN`}
                  checked={selectedMSI === null}
                  onClick={() => setSelectedMSI(null)}
                />
                {msiOptions
                  .filter((o) => totalAmountCharged >= o.minAmount)
                  .map((o) => {
                    const total = computeMsiTotal(totalAmountCharged, o.rate);
                    return (
                      <MsiRow
                        key={o.months}
                        title={t("monthsOptionLabel", { months: o.months })}
                        detail={t("monthlyInstallmentDetail", {
                          monthly: (total / o.months).toFixed(2),
                          total: total.toFixed(2),
                        })}
                        checked={selectedMSI === o.months}
                        onClick={() => setSelectedMSI(o.months)}
                      />
                    );
                  })}
              </div>
              <div className="px-6 py-4 border-t border-tone-200 sticky bottom-0 bg-white">
                <button
                  onClick={() => setShowPaymentOptionsModal(false)}
                  className="w-full bg-even-grass text-even-evergreen py-3 rounded-full cursor-pointer text-base"
                >
                  {tc("confirmCta")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {errorMessage && (
        <div
          className="fixed inset-0 z-99999 flex items-end justify-center bg-black/50"
          onClick={() => !walletVencido && closeError()}
        >
          <div className="bg-white rounded-t-4xl w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 max-w-2xl mx-auto">
              <div className="flex flex-col items-center mb-4">
                <div className="w-14 h-14 rounded-full bg-danger-100 flex items-center justify-center mb-4">
                  <CircleAlert className="size-7 text-danger-500" strokeWidth={2} />
                </div>
                <h2 className="text-xl font-semibold text-black text-center">{errorTitle}</h2>
              </div>
              <div className="bg-surface border border-stroke-soft/50 rounded-xl p-4 mb-6">
                <p className="text-tone-700 text-sm text-center">{errorMessage}</p>
              </div>
              {/* Sin certeza de que no se cobró, no se ofrece "Intentar de nuevo" */}
              <button
                onClick={closeError}
                className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
              >
                {walletVencido
                  ? t("walletExpiredButton")
                  : ordenCambio
                    ? t("viewUpdatedBillCta")
                    : canRetryCharge
                      ? t("tryAgainCta")
                      : tc("understood")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-4 h-4 rounded-full border-2 ${
        checked ? "border-even-grass bg-even-grass" : "border-tone-300"
      }`}
    >
      {checked && <div className="w-full h-full rounded-full bg-white scale-50" />}
    </div>
  );
}

function MsiRow({
  title,
  detail,
  checked,
  onClick,
}: {
  title: string;
  detail: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`py-2 px-5 border rounded-full cursor-pointer transition-colors ${
        checked ? "border-even-grass bg-even-grass/10" : "border-black/50 bg-surface hover:border-tone-400"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="font-medium text-black text-base md:text-lg">{title}</p>
          <p className="text-xs md:text-sm text-tone-600">{detail}</p>
        </div>
        <Radio checked={checked} />
      </div>
    </div>
  );
}

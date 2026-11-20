"use client";

import { PayButton, formatMoney } from "@even/ui";
import { FlowStepCard, useFlowAmount } from "@even/ui/diner";
import { useCart } from "@/context/CartContext";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import { usePayment } from "@/context/PaymentContext";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { buildChargeRequest, computeMsiTotal, MINIMUM_AMOUNT } from "@even/payments";
import { useSavedCardCharge, useWalletPayments } from "@even/payments/react";
import { useAuth } from "@/context/AuthContext";
import { useGuest } from "@/context/GuestContext";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import HighDemandBanner from "@/components/modals/HighDemandBanner";
import { Plus, Trash2, Loader2, CircleAlert, X } from "lucide-react";
import { getCardTypeIcon } from "@/utils/cardIcons";
import OrderAnimation from "@/components/UI/OrderAnimation";
import ValidationError from "@/components/ValidationError";
import { tapOrderService } from "@/services/taporders.service";
import { paymentService } from "@/services/payment.service";
import { calculateCommissions } from "@/utils/commissionCalculator";
import { useAccountDiscount } from "@/hooks/useAccountDiscount";
import { USER_DISCOUNT_SERVICE } from "@/services/userDiscounts.service";
import { useCheckoutContext } from "@/hooks/useCheckoutContext";
import { useRestaurant } from "@/context/RestaurantContext";
import { POSBlockedModal, UnavailableItemsModal, toUnavailableModalItems } from "@even/ui/diner";
import RestaurantClosedModal from "@/components/RestaurantClosedModal";
import { useCartAvailability } from "@/hooks/useCartAvailability";
import {
  clearStoredPaymentIntent,
} from "@/utils/paymentIdempotency";

// Google Pay deshabilitado temporalmente — cambiar a false para reactivarlo.
const GOOGLE_PAY_DISABLED = false;

// Cadencia del polling de "Verificando tu pago…".
export default function CardSelectionPage() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  const { charge: chargeCard, confirm: pollConfirm } = useSavedCardCharge({
    paymentService,
    confirm: (body: any) => tapOrderService.confirmOrder(body),
  });
  const {
    validationError,
    restaurantId: restaurantIdNum,
    branchNumber,
  } = useValidateAccess();
  const restaurantId = restaurantIdNum.toString();
  const {
    provider,
    msiConfig,
    isHighDemand,
    isLoading: isLoadingCheckoutContext,
    isAgentDisconnected,
    isTurnoClosed,
    refetchAgentStatus,
  } = useCheckoutContext(restaurantIdNum, branchNumber);
  const isLoadingProvider = isLoadingCheckoutContext;
  const isLoadingAgentStatus = isLoadingCheckoutContext;
  const { restaurant } = useRestaurant();

  const {
    state: cartState,
    clearCart,
    orderNotes,
    setOrderNotes,
    updateQuantity,
  } = useCart();
  const { block: cartBlock, unavailableItems } = useCartAvailability(
    cartState.items,
  );
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [showUnavailableModal, setShowUnavailableModal] = useState(false);
  const openCartBlockModal = () => {
    if (cartBlock === "closed") setShowClosedModal(true);
    else if (cartBlock === "unavailable") setShowUnavailableModal(true);
  };
  const { navigateWithTable, tableNumber } = useTableNavigation();
  const { paymentMethods, deletePaymentMethod } = usePayment();
  const { user, profile } = useAuth();
  const { guestId, guestName } = useGuest();
  const searchParams = useSearchParams();

  const allPaymentMethods = [...paymentMethods];

  // "% en la cuenta" ya reclamado — personal (TK-0078) o promo QR — se
  // descuenta ANTES de calcular comisiones/total para que TODO lo derivado
  // (cobro, orden, registros) salga del monto ya descontado. El backend
  // valida y consume el único uso al cobrar (en /payments o en confirmOrder).
  const { accountDiscount, loading: accountDiscountLoading } =
    useAccountDiscount(restaurantIdNum, branchNumber);
  const cartBaseAmount = cartState.totalPrice;
  const orderDiscountAmount = accountDiscount
    ? Math.round(cartBaseAmount * accountDiscount.discountPercentage) / 100
    : 0;
  const baseAmount =
    Math.round((cartBaseAmount - orderDiscountAmount) * 100) / 100;

  // Propina desde URL
  const tipAmountFromParam = parseFloat(searchParams.get("tipAmount") || "0");
  const tipAmount = tipAmountFromParam;

  const [showPaymentOptionsModal, setShowPaymentOptionsModal] = useState(false);
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [selectedMSI, setSelectedMSI] = useState<number | null>(null);

  // Tarjetas
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<
    string | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  // El carrito vive en el provider: si ya cargó (vengo de la confirmación) no
  // hay nada que esperar y el paso se pinta completo desde el primer render.
  // Solo se muestra la tarjeta elegida; el resto aparece al pedir "Ver otras tarjetas".
  const [showAllCards, setShowAllCards] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(
    !cartState.hasLoaded || cartState.isLoading,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>(t("processingError"));
  // False cuando ya hay certeza de que se cobró (o no hay
  // certeza de lo contrario) — el modal de error no debe ofrecer un botón
  // que dispare un segundo cobro.
  const [canRetryCharge, setCanRetryCharge] = useState(true);
  // Pantalla "Verificando tu pago…" — sustituye al mensaje de timeout de
  // OrderAnimation. La confirmación real sigue corriendo en segundo plano
  // (la misma llamada a handleConfirmPayment, que no se cancela); esta
  // pantalla solo refleja que seguimos esperando su resultado.
  const [verifying, setVerifying] = useState(false);

  const [googlePayToken, setGooglePayToken] = useState<string | null>(null);

  // Refs para valores frescos en success handlers sin stale closures
  const cartItemsRef = useRef(cartState.items);
  const cartUserNameRef = useRef(cartState.userName);
  const profileRef = useRef(profile);
  const guestNameRef = useRef(guestName);
  useEffect(() => {
    cartItemsRef.current = cartState.items;
  }, [cartState.items]);
  useEffect(() => {
    cartUserNameRef.current = cartState.userName;
  }, [cartState.userName]);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  useEffect(() => {
    guestNameRef.current = guestName;
  }, [guestName]);

  // Banner de alta demanda
  const [showHighDemandBanner, setShowHighDemandBanner] = useState(false);

  useEffect(() => {
    if (isHighDemand) setShowHighDemandBanner(true);
  }, [isHighDemand]);

  // Animación de orden
  const [showAnimation, setShowAnimation] = useState(false);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [completedOrderItems, setCompletedOrderItems] = useState<
    typeof cartState.items
  >([]);
  const [completedUserName, setCompletedUserName] = useState<string>("");

  // Red de seguridad: si se llega acá con el carrito vacío (link viejo,
  // navegación stale, etc.) no hay nada que pagar. No aplica mientras se
  // muestra la animación de éxito, ni mientras se verifica/ya se resolvió un
  // pago confirmado por la vía lenta: ahí también se limpia
  // el carrito a propósito, antes de navegar a payment-success. El
  // `!completedOrderId` es necesario además de `!verifying` porque el efecto
  // que navega a payment-success apaga `verifying` en el mismo tick en que
  // navega — sin este guard, ese cambio de `verifying` a false re-disparaba
  // este efecto y mandaba a /menu justo después (o en carrera) con la
  // navegación a payment-success, ganándole.
  useEffect(() => {
    if (
      cartState.hasLoaded &&
      !cartState.isLoading &&
      cartState.items.length === 0 &&
      !showAnimation &&
      !verifying &&
      !completedOrderId
    ) {
      navigateWithTable("/menu", true);
    }
  }, [
    cartState.hasLoaded,
    cartState.isLoading,
    cartState.items.length,
    verifying,
    completedOrderId,
    showAnimation,
    navigateWithTable,
  ]);

  const commissions = calculateCommissions(baseAmount, tipAmount);
  const {
    ivaTip,
    subtotalForCommission,
    evenCommissionTotal,
    evenCommissionClient,
    evenCommissionRestaurant,
    ivaEvenClient,
    ivaEvenRestaurant,
    evenClientCharge,
    evenRestaurantCharge,
    totalAmountCharged: totalAmount,
  } = commissions;

  useEffect(() => {
    if (!selectedPaymentMethodId && allPaymentMethods.length > 0) {
      const defaultMethod =
        allPaymentMethods.find((pm) => pm.isDefault) || allPaymentMethods[0];
      setSelectedPaymentMethodId(defaultMethod.id);
    }
    if (!cartState.isLoading) {
      setIsLoadingInitial(false);
    }
  }, [allPaymentMethods.length, selectedPaymentMethodId, cartState.isLoading]);

  // Apple Pay y Google Pay (SDK de EcartPay): la lógica vive en @even/payments/react.
  const showWalletAnimation = () => {
    sessionStorage.removeItem("even-current-order-id");
    sessionStorage.removeItem("even-current-payment-key");
    setCompletedOrderItems([...cartItemsRef.current]);
    setCompletedUserName(
      profileRef.current
        ? [profileRef.current.firstName, profileRef.current.lastName]
            .filter(Boolean)
            .join(" ") || "Usuario"
        : guestNameRef.current || cartUserNameRef.current || "Usuario",
    );
    setShowAnimation(true);
  };
  const {
    applePayReady,
    applePayUnavailable,
    walletOrderRejected,
    isApplePayProcessing,
    applePayPaymentId,
    googlePayReady,
    googlePayUnavailable,
    isGooglePayProcessing,
    googlePayPaymentId,
  } = useWalletPayments({
    paymentService,
    sdkEnabled:
      !isLoadingProvider && (provider === null || provider === "ecartpay"),
    // D-34: sin carrito cargado el consumo es 0 y el total es solo la
    // propina; pedir la orden entonces dejaba una orden huérfana en
    // EcartPay sin consumo ni items.
    canCreateOrders:
      !isLoadingInitial &&
      !accountDiscountLoading &&
      cartState.hasLoaded &&
      cartState.items.length > 0 &&
      baseAmount > 0 &&
      totalAmount > 0,
    orderKey: [
      isLoadingInitial,
      accountDiscountLoading,
      totalAmount,
      baseAmount,
      cartState.hasLoaded,
      cartState.items.length,
    ].join("|"),
    amount: totalAmount,
    prepareOrder: () => ({
      fingerprint: {
        items: cartState.items.map((i) => ({
          menuItemId: i.id,
          quantity: i.quantity || 1,
          extraPrice: i.extraPrice || 0,
          customFields: i.customFields || null,
        })),
        tipAmount,
        discountId: accountDiscount?.id ?? null,
        total: totalAmount,
      },
      request: {
        amount: totalAmount,
        currency: "MXN",
        restaurantId: restaurantId,
        customerName: profileRef.current
          ? [profileRef.current.firstName, profileRef.current.lastName]
              .filter(Boolean)
              .join(" ") || undefined
          : guestNameRef.current || cartUserNameRef.current || undefined,
        baseAmount,
        tipAmount,
        items: cartState.items.map((i) => ({
          name: i.name,
          price: i.price,
          quantity: i.quantity || 1,
          extraPrice: (i.extraPrice || 0) * (i.quantity || 1),
          // even-backend #333: el id del carrito permite al servidor
          // recalcular el consumo contra cart_items en vez de cobrar el
          // total que mandamos. Es opcional en el backend: sin él, cobra
          // igual que antes.
          cartItemId: i.cartItemId,
        })),
        userDiscountId:
          accountDiscount?.source === "personal" ? accountDiscount.id : undefined,
        promoRedemptionId:
          accountDiscount?.source === "promo" ? accountDiscount.id : undefined,
        service: USER_DISCOUNT_SERVICE,
      },
    }),
    apple: { detection: "once", onUnsupported: "ignore", label: restaurant?.name || "Even" },
    google: { disabled: GOOGLE_PAY_DISABLED },
    onApplePaySuccess: showWalletAnimation,
    onGooglePaySuccess: ({ token }) => {
      setGooglePayToken(token);
      showWalletAnimation();
    },
    onGooglePayPaymentError: () => {
      // Intento real de pago fallido: avisar al usuario y dejarlo reintentar o
      // pagar con tarjeta guardada.
      setCanRetryCharge(true);
      setErrorTitle(t("googlePayErrorTitle"));
      setErrorMessage(t("googlePayErrorMessage"));
    },
  });

  const handleInitiatePayment = async (): Promise<void> => {
    if (cartBlock) {
      openCartBlockModal();
      return;
    }
    if (isAgentDisconnected || isTurnoClosed) {
      setShowPOSModal(true);
      return;
    }

    // Fresh ping — cached hook state can be stale if agent dropped after page load
    const freshStatus = await refetchAgentStatus();
    if (
      freshStatus &&
      freshStatus.hasIntegration &&
      freshStatus.isActive &&
      !freshStatus.isAgentConnected
    ) {
      setShowPOSModal(true);
      return;
    }

    if (!tableNumber) {
      setErrorMessage(t("tableNotFoundError"));
      return;
    }
    if (!selectedPaymentMethodId) {
      setErrorMessage(t("errorSelectCard"));
      return;
    }
    setCompletedOrderItems([...cartState.items]);
    setCompletedUserName(
      profile
        ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
            "Usuario"
        : guestNameRef.current || cartState.userName || "Usuario",
    );
    setShowAnimation(true);
  };

  const handleCancelPayment = () => {
    setShowAnimation(false);
    setCompletedOrderItems([]);
    setCompletedUserName("");
  };

  // Red de seguridad de OrderAnimation: el pago/orden nunca llegó a
  // confirmarse dentro del tiempo de espera VISUAL. La llamada real a
  // handleConfirmPayment sigue corriendo en segundo plano (no se cancela) y
  // puede seguir reintentando /confirm internamente — esta pantalla solo
  // refleja que seguimos esperando su resultado, nunca ofrece recobrar.
  const handleConfirmTimeout = () => {
    setShowAnimation(false);
    setVerifying(true);
  };

  // Una vez que la orden queda confirmada, `completedOrderId` se entera sin
  // importar si la pantalla activa era OrderAnimation o "Verificando tu
  // pago…" — si es esta última, navega directo (OrderAnimation ya no está
  // montado para hacerlo por su cuenta).
  useEffect(() => {
    if (!verifying || !completedOrderId) return;
    setVerifying(false);
    navigateWithTable(
      `/payment-success?orderId=${completedOrderId}&success=true`,
      true,
    );
  }, [verifying, completedOrderId, navigateWithTable]);

  useEffect(() => {
    if (errorMessage) setVerifying(false);
  }, [errorMessage]);

  const handleConfirmPayment = async (): Promise<void> => {
    const items =
      completedOrderItems.length > 0 ? completedOrderItems : cartState.items;

    if (!items || items.length === 0) {
      setErrorMessage(t("errorEmptyCart"));
      setShowAnimation(false);
      return;
    }

    const userId = user?.id || guestId || null;
    const customerName = profile
      ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
        "Invitado"
      : guestName || cartState.userName || "Invitado";
    const customerEmail = profile?.email || user?.email || null;
    const customerPhone = user?.phone || null;
    const isGuest = !user?.id && !!guestId;
    const evenRateApplied =
      subtotalForCommission > 0
        ? (evenCommissionTotal / subtotalForCommission) * 100
        : 0;

    const mappedItems = items.map((item) => ({
      item: item.name,
      price: item.price,
      quantity: item.quantity || 1,
      images:
        item.images && Array.isArray(item.images) && item.images.length > 0
          ? item.images.filter((img) => typeof img === "string")
          : [],
      custom_fields:
        item.customFields &&
        Array.isArray(item.customFields) &&
        item.customFields.length > 0
          ? item.customFields
          : null,
      extra_price: item.extraPrice || 0,
      menu_item_id: item.id ? item.id.toString() : null,
      special_instructions: item.specialInstructions || null,
      user_discount_id: item.userDiscountId || null,
      is_promo_item: item.isPromoItem || false,
      cart_item_id: item.cartItemId || null,
    }));

    const commonBody = {
      clerk_user_id: userId,
      guest_id: guestId || null,
      user_id: userId,
      is_guest: isGuest,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      restaurant_id: parseInt(restaurantId),
      branch_number: parseInt(branchNumber.toString()),
      table_number: tableNumber!,
      order_notes: orderNotes.trim() || null,
      items: mappedItems,
      base_amount: baseAmount,
      tip_amount: tipAmount,
      total_amount_charged: totalAmount,
      // Descuento de cuenta aplicado (si hay): el backend lo consume al
      // confirmar si el cobro no pasó por /payments (wallets). Solo una de
      // las dos fuentes puede venir a la vez (ver useAccountDiscount).
      user_discount_id:
        accountDiscount?.source === "personal" ? accountDiscount.id : null,
      promo_redemption_id:
        accountDiscount?.source === "promo" ? accountDiscount.id : null,
      currency: "MXN",
      transaction_by: customerName,
      iva_tip: ivaTip,
      even_commission_total: evenCommissionTotal,
      even_commission_client: evenCommissionClient,
      even_commission_restaurant: evenCommissionRestaurant,
      iva_even_client: ivaEvenClient,
      iva_even_restaurant: ivaEvenRestaurant,
      even_client_charge: evenClientCharge,
      even_restaurant_charge: evenRestaurantCharge,
      even_rate_applied: evenRateApplied,
    };

    const saveAndFinalize = (
      tapOrderId: string,
      paymentId: string,
      transactionId: string,
      cardLast4: string,
      cardBrand: string,
      paymentMethodId: string | null,
    ) => {
      const userName = profile
        ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
          "Usuario"
        : guestName || cartState.userName || "Usuario";
      const chargedAmount = selectedMSI ? displayTotal : totalAmount;
      const data = {
        orderId: tapOrderId,
        paymentId,
        transactionId,
        totalAmountCharged: chargedAmount,
        amount: chargedAmount,
        baseAmount,
        tipAmount,
        installments: selectedMSI || null,
        installmentBaseAmount: selectedMSI ? totalAmount : null,
        evenCommissionClient,
        ivaEvenClient,
        evenCommissionTotal,
        userName,
        customerName,
        customerEmail,
        customerPhone,
        cardLast4,
        cardBrand,
        orderStatus: "confirmed",
        paymentStatus: "paid",
        createdAt: new Date().toISOString(),
        dishOrders: items.map((item) => ({
          dish_order_id: item.id || Date.now(),
          item: item.name,
          quantity: item.quantity || 1,
          price: item.price,
          extra_price: item.extraPrice || 0,
          total_price: item.price * (item.quantity || 1),
          guest_name: customerName,
          custom_fields: item.customFields || null,
          images: item.images,
        })),
        restaurantId: parseInt(restaurantId),
        paymentMethodId,
        timestamp: Date.now(),
        tableNumber,
      };

      localStorage.setItem("even-completed-payment", JSON.stringify(data));
      const uniqueKey = `even-payment-success-${tapOrderId}`;
      sessionStorage.setItem(uniqueKey, JSON.stringify(data));
      sessionStorage.setItem("even-current-payment-key", uniqueKey);
      sessionStorage.setItem("even-current-order-id", tapOrderId);
    };

    // La orden quedó confirmada — se limpia la clave de
    // idempotencia (solo se limpia AQUÍ, nunca antes) y se navega igual que
    // el flujo de siempre.
    const finalizeConfirmedOrder = (
      order: any,
      paymentId: string,
      transactionId: string,
      cardLast4: string,
      cardBrand: string,
      paymentMethodId: string | null,
    ) => {
      saveAndFinalize(
        order.id,
        paymentId,
        transactionId,
        cardLast4,
        cardBrand,
        paymentMethodId,
      );
      clearStoredPaymentIntent();
      setOrderNotes("");
      void clearCart();
      setCanRetryCharge(true);
      // NO apagar `verifying` aquí. Cuando esto se llama
      // desde la vía lenta (después de handleConfirmTimeout), `verifying`
      // sigue en true y es la señal que el useEffect de arriba necesita
      // para navegar — si se apaga aquí, ese effect ve `verifying=false`
      // y nunca navega (se queda pantalla en blanco sin ir a
      // payment-success). El propio effect lo apaga justo antes de navegar.
      setCompletedOrderId(order.id);
    };

    const showTerminalConfirmError = () => {
      setShowAnimation(false);
      setVerifying(false);
      setCanRetryCharge(false);
      setErrorTitle(t("confirmFailedTitle"));
      setErrorMessage(t("confirmFailedMessage"));
    };

    setIsProcessing(true);
    // Una vez que la orden se confirma, el botón de pagar
    // NUNCA debe volver a habilitarse, así la navegación a payment-success
    // tarde lo que tarde (es una petición de red aparte — con la red lenta,
    // hay una ventana real entre "ya se confirmó" y "el navegador ya
    // cambió de pantalla" en la que, sin esta bandera, el finally de abajo
    // reactivaba el botón y dejaba iniciar un segundo cobro real).
    let orderCompletedSuccessfully = false;

    try {
      // ── Apple Pay ────────────────────────────────────────────────────
      // El cargo ya ocurrió vía el SDK — reintentar acá NUNCA reabre el
      // sheet: solo reintenta /confirm con el mismo
      // ecartpay_order_id, que vive en el estado de React y sobrevive a que
      // OrderAnimation se cierre por su timeout.
      if (isApplePayProcessing) {
        if (!applePayPaymentId) {
          throw new Error(t("errorConfirmPayment"));
        }
        const result = await pollConfirm(() => ({
          ...commonBody,
          payment_method_id: null,
          payment_source: "apple_pay",
          ecartpay_order_id: applePayPaymentId,
        }));

        if (!result.success) {
          showTerminalConfirmError();
          return;
        }

        orderCompletedSuccessfully = true;
        finalizeConfirmedOrder(
          result.order,
          `apple-pay-${result.order.id}`,
          result.order.id,
          "AP",
          "apple",
          null,
        );
        return;
      }

      // ── Google Pay ───────────────────────────────────────────────────
      if (isGooglePayProcessing) {
        if (!googlePayPaymentId) {
          throw new Error(t("errorConfirmPayment"));
        }
        const result = await pollConfirm(() => ({
          ...commonBody,
          payment_method_id: null,
          payment_source: "google_pay",
          ecartpay_order_id: googlePayPaymentId,
          google_pay_token: googlePayToken,
        }));

        if (!result.success) {
          showTerminalConfirmError();
          return;
        }

        orderCompletedSuccessfully = true;
        finalizeConfirmedOrder(
          result.order,
          `google-pay-${result.order.id}`,
          result.order.id,
          "GP",
          "google",
          null,
        );
        return;
      }

      if (!tableNumber || !selectedPaymentMethodId) {
        setShowAnimation(false);
        return;
      }

      // ── Tarjeta guardada ─────────────────────────────────────────────
      // Después de un 2xx de /payments, esta app NUNCA
      // vuelve a llamar /payments con otra clave para el mismo carrito. La
      // clave y el fingerprint solo se regeneran si el carrito cambió.
      const outcome = await chargeCard({
        fingerprintInput: {
          items: items.map((i) => ({
            menuItemId: i.id,
            quantity: i.quantity || 1,
            extraPrice: i.extraPrice || 0,
            customFields: i.customFields || null,
          })),
          tipAmount,
          discountId: accountDiscount?.id ?? null,
          total: selectedMSI ? displayTotal : totalAmount,
        },
        // payment_in_progress: se espera a que resuelva el cobro con ese intentKey.
        onVerifying: () => {
          setShowAnimation(false);
          setVerifying(true);
        },
        request: buildChargeRequest({
          paymentMethodId: selectedPaymentMethodId,
          amount: totalAmount,
          description: `Pago Mesa ${tableNumber} - ${customerName}`,
          orderId: `order-${Date.now()}`,
          orderType: "tap-order-pay",
          tableNumber: tableNumber,
          restaurantId,
          installments: selectedMSI,
          baseAmount,
          tipAmount,
          discount: accountDiscount,
          service: USER_DISCOUNT_SERVICE,
          items: selectedMSI
            ? undefined
            : items.map((i) => ({
                name: i.name,
                price: i.price,
                quantity: i.quantity || 1,
                extraPrice: (i.extraPrice || 0) * (i.quantity || 1),
                cartItemId: i.cartItemId,
              })),
        }),
      });

      if (outcome.status === "unconfirmed") {
        // payment_unknown / charge_unconfirmed / polling agotado: sin certeza
        // de que no se cobró — nunca se ofrece recobrar.
        showTerminalConfirmError();
        return;
      }

      if (outcome.status === "retryable") {
        switch (outcome.reason) {
          case "intent_mismatch":
            // El carrito cambió respecto al intento guardado — nunca se cobró
            // con estos datos (el core ya descartó el intento).
            setShowAnimation(false);
            setCanRetryCharge(true);
            setErrorTitle(t("orderChangedTitle"));
            setErrorMessage(t("orderChangedMessage"));
            return;
          case "idempotency_unavailable":
            // 503 — no hubo cobro, sí es seguro reintentar en unos segundos.
            setShowAnimation(false);
            setCanRetryCharge(true);
            setErrorTitle(t("retryTitle"));
            setErrorMessage(t("retryShortMessage"));
            return;
          case "payment_rejected":
            // Rechazo definitivo (422): no se cobró (el core ya descartó el
            // intento para que otra tarjeta no reciba el replay del rechazo).
            setShowAnimation(false);
            setCanRetryCharge(true);
            setErrorTitle(t("paymentRejectedTitle"));
            setErrorMessage(outcome.message || t("paymentRejectedMessage"));
            return;
          case "missing_order_id":
            throw new Error(t("errorConfirmPayment"));
          default:
            // card_declined / validation_error / etc. — certeza de que NO se
            // cobró, se puede reintentar con otra tarjeta tal cual.
            throw new Error(outcome.message || t("processingError"));
        }
      }

      const ecartpayOrderId = outcome.ecartpayOrderId;

      const selectedMethod = allPaymentMethods.find(
        (pm) => pm.id === selectedPaymentMethodId,
      );

      const confirmOutcome = await pollConfirm(() => ({
        ...commonBody,
        total_amount_charged: selectedMSI ? displayTotal : totalAmount,
        payment_method_id: selectedPaymentMethodId,
        payment_source: "saved_card",
        ecartpay_order_id: ecartpayOrderId,
        installments: selectedMSI || null,
      }));

      if (!confirmOutcome.success) {
        showTerminalConfirmError();
        return;
      }

      orderCompletedSuccessfully = true;
      finalizeConfirmedOrder(
        confirmOutcome.order,
        `tap-order-${confirmOutcome.order.id}`,
        confirmOutcome.order.id,
        selectedMethod?.lastFourDigits || "****",
        selectedMethod?.cardBrand || "visa",
        selectedPaymentMethodId,
      );
    } catch (error) {
      sessionStorage.removeItem("even-current-order-id");
      sessionStorage.removeItem("even-current-payment-key");
      setCompletedOrderId(null);
      setVerifying(false);
      setCanRetryCharge(true);
      const rawMessage =
        error instanceof Error ? error.message : t("errorUnknown");
      const errorTranslations: Record<string, string> = {
        "Transaction rejected by your bank, please try another card.": t(
          "errors.bankRejected",
        ),
        "Insufficient funds": t("errors.insufficientFunds"),
        "Card expired": t("errors.cardExpired"),
        "Invalid card number": t("errors.invalidCardNumber"),
        "An unknown error occurred": t("errors.unknownPaymentError"),
      };
      setErrorTitle(t("processingError"));
      setErrorMessage(errorTranslations[rawMessage] ?? rawMessage);
      setShowAnimation(false);
    } finally {
      if (!orderCompletedSuccessfully) {
        setIsProcessing(false);
      }
    }
  };

  const handleAddCard = (): void => {
    navigateWithTable(
      `/add-card?amount=${totalAmount}&baseAmount=${baseAmount}&scan=false`,
    );
  };

  const handleDeleteCard = async (paymentMethodId: string) => {
    if (!confirm(tc("confirmDeleteCard"))) return;
    setDeletingCardId(paymentMethodId);
    try {
      await deletePaymentMethod(paymentMethodId);
    } catch {
      setErrorTitle(t("deleteCardErrorTitle"));
      setErrorMessage(t("deleteCardErrorMessage"));
    } finally {
      setDeletingCardId(null);
    }
  };

  const getDisplayTotal = () => {
    if (selectedMSI === null) return totalAmount;
    const selectedMethod = allPaymentMethods.find(
      (pm) => pm.id === selectedPaymentMethodId,
    );
    const cardBrand = selectedMethod?.cardBrand;
    const msiOptions = cardBrand === "amex" ? msiConfig.amex : msiConfig.visaMc;
    const selectedOption = msiOptions.find((opt) => opt.months === selectedMSI);
    if (!selectedOption) return totalAmount;
    return computeMsiTotal(totalAmount, selectedOption.rate);
  };

  const displayTotal = getDisplayTotal();
  const isUnderMinimum = totalAmount < MINIMUM_AMOUNT;

  // El hero lee este mismo `displayTotal`: es lo que se cobra (con el costo de los meses sin intereses, si aplica).
  const financingCost = Math.max(displayTotal - totalAmount, 0);
  useFlowAmount(
    isLoadingInitial || isLoadingProvider
      ? null
      : {
          total: displayTotal,
          bill: baseAmount,
          tip: tipAmount,
          commission: evenClientCharge,
          financing: financingCost > 0.004 ? financingCost : undefined,
        },
  );

  if (isLoadingInitial || isLoadingProvider) {
    return (
      <div className="min-h-dvh brand-evergreen flex flex-col app-root">
        <MenuHeaderBack />
        <FlowStepCard step="card-selection" loading>
          {null}
        </FlowStepCard>
      </div>
    );
  }

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <>
      {showHighDemandBanner && (
        <HighDemandBanner onDismiss={() => setShowHighDemandBanner(false)} />
      )}

      {showAnimation && (
        <OrderAnimation
          userName={completedUserName}
          orderedItems={completedOrderItems}
          orderId={completedOrderId}
          onTimeout={handleConfirmTimeout}
          onContinue={() => {
            let orderId = sessionStorage.getItem("even-current-order-id");

            if (!orderId) {
              orderId = completedOrderId;
            }

            if (!orderId) {
              for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith("even-payment-success-")) {
                  try {
                    const data = sessionStorage.getItem(key);
                    if (data) {
                      orderId = JSON.parse(data).orderId;
                      break;
                    }
                  } catch {}
                }
              }
            }

            if (!orderId) {
              try {
                const data = localStorage.getItem("even-completed-payment");
                if (data) orderId = JSON.parse(data).orderId;
              } catch {}
            }

            if (!orderId || orderId === "unknown") return;

            navigateWithTable(
              `/payment-success?orderId=${orderId}&success=true`,
              true,
            );
          }}
          onCancel={
            isApplePayProcessing || isGooglePayProcessing
              ? undefined
              : handleCancelPayment
          }
          onConfirm={handleConfirmPayment}
        />
      )}

      {/* Sustituye al timeout muerto de OrderAnimation — la
          confirmación real sigue corriendo en segundo plano (la promesa de
          handleConfirmPayment no se cancela), esta pantalla solo comunica
          que seguimos esperando. Sin botón de cancelar ni de reintentar: un
          cobro ya pudo haberse concretado. */}
      {verifying && (
        <div className="fixed inset-0 z-9999 bg-white flex flex-col items-center justify-center px-8 text-center gap-6">
          <Loader2 className="size-12 text-even-evergreen animate-spin" />
          <div>
            <h2 className="text-xl font-medium text-black mb-2">
              {t("verifyingPaymentTitle")}
            </h2>
            <p className="text-sm text-tone-500 max-w-xs">
              {t("verifyingPaymentMessage")}
            </p>
          </div>
        </div>
      )}

      <div className="min-h-dvh brand-evergreen flex flex-col app-root">
        <MenuHeaderBack />

        <FlowStepCard step="card-selection">
              <div className="flex-1 overflow-y-auto py-8 pb-[130px] short:py-3 short:pb-[96px]">
                {/* Descuento (el total vive en el hero) */}
                {accountDiscount && orderDiscountAmount > 0 && (
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-lg font-medium text-even-evergreen md:text-xl lg:text-2xl">
                      {tc("discount")} ({accountDiscount.discountPercentage}%)
                    </span>
                    <span className="text-lg font-medium text-even-evergreen md:text-xl lg:text-2xl">
                      -${orderDiscountAmount.toFixed(2)} MXN
                    </span>
                  </div>
                )}

                {/* Alerta de mínimo */}
                {isUnderMinimum && totalAmount > 0 && (
                  <div className="bg-danger-50 px-6 py-3 -mx-8 rounded-lg mb-4">
                    <div className="flex justify-center items-center gap-3">
                      <X className="size-6 text-danger-500 shrink-0" />
                      <p className="text-danger-700 font-medium text-base md:text-lg">
                        {t("minimumPurchaseWarning", {
                          amount: MINIMUM_AMOUNT.toFixed(2),
                        })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Pago a meses — solo tarjeta de crédito */}
                <div className="mb-4">
                  {(() => {
                    const selectedMethod = allPaymentMethods.find(
                      (pm) => pm.id === selectedPaymentMethodId,
                    );
                    return selectedMethod?.cardType === "credit" &&
                      msiConfig.isActive &&
                      totalAmount >= 300 ? (
                      <div
                        className="cursor-pointer py-2"
                        onClick={() => setShowPaymentOptionsModal(true)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-black text-lg md:text-xl lg:text-2xl">
                            Pago a meses
                          </span>
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              selectedMSI !== null
                                ? "border-even-grass bg-even-grass"
                                : "border-tone-300"
                            }`}
                          >
                            {selectedMSI !== null && (
                              <div className="w-full h-full rounded-full bg-white scale-50" />
                            )}
                          </div>
                        </div>
                        {selectedMSI !== null && (
                          <p className="mt-1 text-base text-tone-600 md:text-lg">
                            ${(displayTotal / selectedMSI).toFixed(2)} MXN x{" "}
                            {selectedMSI} meses
                          </p>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Métodos de pago */}
                <div className="mb-2.5">
                  <h3 className="mb-3 text-lg font-medium text-black short:mb-2 md:text-xl lg:text-2xl">
                    Métodos de pago
                  </h3>
                  <div className="space-y-2.5 short:space-y-1.5">
                    {(showAllCards
                      ? allPaymentMethods
                      : allPaymentMethods.filter(
                          (pm) => pm.id === selectedPaymentMethodId,
                        )
                    ).map((method) => (
                      <div
                        key={method.id}
                        className={`flex items-center py-4 px-5 pl-10 short:py-3 border rounded-full transition-colors ${
                          selectedPaymentMethodId === method.id
                            ? "border-even-grass bg-even-grass/10"
                            : "border-black/50 bg-surface"
                        }`}
                      >
                        <div
                          onClick={() => {
                            setSelectedPaymentMethodId(method.id);
                            setSelectedMSI(null);
                            setShowAllCards(false);
                          }}
                          className="flex items-center justify-center gap-3 mx-auto cursor-pointer"
                        >
                          <div>{getCardTypeIcon(method.cardBrand)}</div>
                          <div>
                            <p className="text-black">
                              **** {method.lastFourDigits}
                            </p>
                          </div>
                        </div>

                        <div
                          onClick={() => {
                            setSelectedPaymentMethodId(method.id);
                            setSelectedMSI(null);
                            setShowAllCards(false);
                          }}
                          className={`w-4 h-4 rounded-full border-2 cursor-pointer ${
                            selectedPaymentMethodId === method.id
                              ? "border-even-grass bg-even-grass"
                              : "border-tone-300"
                          }`}
                        >
                          {selectedPaymentMethodId === method.id && (
                            <div className="w-full h-full rounded-full bg-white scale-50" />
                          )}
                        </div>

                        <button
                          onClick={() => handleDeleteCard(method.id)}
                          disabled={deletingCardId === method.id}
                          className="pl-2 text-tone-400 hover:text-danger-600 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {deletingCardId === method.id ? (
                            <Loader2 className="size-5 animate-spin" />
                          ) : (
                            <Trash2 className="size-5" />
                          )}
                        </button>
                      </div>
                    ))}

                    {!showAllCards && allPaymentMethods.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setShowAllCards(true)}
                        className="w-full py-1.5 short:py-0.5 text-sm md:text-base font-medium text-tone-600 underline underline-offset-4 cursor-pointer"
                      >
                        {t("showOtherCards", {
                          count: allPaymentMethods.length - 1,
                        })}
                      </button>
                    )}

                    {walletOrderRejected && (
                      <p className="text-sm text-tone-600 text-center">
                        {t("walletUnavailableMessage")}
                      </p>
                    )}

                    {/* Apple Pay */}
                    {!applePayUnavailable &&
                      !isLoadingAgentStatus &&
                      !isAgentDisconnected &&
                      !isTurnoClosed && (
                        <div className="relative w-full h-12 short:h-11">
                          <div id="apple-pay-container" className="w-full" />
                          {cartBlock && (
                            <div
                              className="absolute inset-0 z-10 cursor-pointer"
                              onClick={openCartBlockModal}
                            />
                          )}
                          {!applePayReady && (
                            <div className="absolute inset-0 rounded-full bg-black flex items-center justify-center gap-2">
                              <span
                                className="text-white text-xl leading-none"
                                style={{
                                  fontFamily:
                                    "-apple-system, BlinkMacSystemFont, sans-serif",
                                }}
                                aria-hidden="true"
                              >
                                {""}
                              </span>
                              <span className="text-white font-medium text-base tracking-wide">
                                Pay
                              </span>
                              <Loader2 className="size-4 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                      )}

                    {/* Google Pay */}
                    {!googlePayUnavailable &&
                      !isLoadingAgentStatus &&
                      !isAgentDisconnected &&
                      !isTurnoClosed && (
                        <div className="relative w-full h-12 short:h-11">
                          <div id="google-pay-container" className="w-full" />
                          {cartBlock && (
                            <div
                              className="absolute inset-0 z-10 cursor-pointer"
                              onClick={openCartBlockModal}
                            />
                          )}
                          {!googlePayReady && (
                            <div className="absolute inset-0 rounded-full bg-black flex items-center justify-center gap-2">
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 18 18"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                                  fill="#4285F4"
                                />
                                <path
                                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                                  fill="#34A853"
                                />
                                <path
                                  d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                                  fill="#FBBC05"
                                />
                                <path
                                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                                  fill="#EA4335"
                                />
                              </svg>
                              <span className="text-white font-medium text-base tracking-wide">
                                Pay
                              </span>
                              <Loader2 className="size-4 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </div>

                {/* Agregar tarjeta */}
                <div className="mb-2.5">
                  <button
                    onClick={handleAddCard}
                    className="border border-black/50 flex justify-center items-center gap-1 w-full text-black py-3 short:py-2 rounded-full cursor-pointer transition-colors bg-surface hover:bg-tone-100"
                  >
                    <Plus className="size-5" />
                    Agregar método de pago
                  </button>
                </div>
              </div>
        </FlowStepCard>

        {/* Barra inferior fija */}
        <div className="fixed fixed-col bottom-0 bg-white px-6 md:px-8 lg:px-10 z-90 py-6 short:py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <PayButton
            onClick={handleInitiatePayment}
            disabled={
              isProcessing || !selectedPaymentMethodId || isUnderMinimum
            }
          >
            {isProcessing ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{t("processingPaymentCta")}</span>
              </div>
            ) : !selectedPaymentMethodId ? (
              t("selectCardCta")
            ) : isUnderMinimum ? (
              t("minimumNotReachedCta")
            ) : (
              tc("payCtaAmount", { amount: formatMoney(displayTotal) })
            )}
          </PayButton>
        </div>


        {/* Modal opciones de pago (MSI) */}
        {showPaymentOptionsModal && (
          <div
            className="fixed inset-0 flex items-end justify-center backdrop-blur-sm"
            style={{ zIndex: 99999 }}
          >
            <div
              className="absolute inset-0 bg-black/20"
              onClick={() => setShowPaymentOptionsModal(false)}
            />
            <div className="relative bg-white rounded-t-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="px-6 pt-4 sticky top-0 bg-white z-10">
                <div className="flex items-center justify-between pb-4 border-b border-stroke">
                  <h3 className="text-lg font-semibold text-black">
                    Opciones de pago
                  </h3>
                  <button
                    onClick={() => setShowPaymentOptionsModal(false)}
                    className="p-1 hover:bg-tone-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="size-5 text-tone-500" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-4">
                {(() => {
                  const selectedMethod = allPaymentMethods.find(
                    (pm) => pm.id === selectedPaymentMethodId,
                  );
                  const cardBrand = selectedMethod?.cardBrand;
                  const msiOptions =
                    cardBrand === "amex" ? msiConfig.amex : msiConfig.visaMc;
                  const availableOptions = msiOptions.filter(
                    (o) => totalAmount >= o.minAmount,
                  );
                  const minAmountNeeded = msiOptions[0]?.minAmount || 0;

                  return (
                    <div className="space-y-2.5">
                      <div
                        onClick={() => setSelectedMSI(null)}
                        className={`py-2 px-5 border rounded-full cursor-pointer transition-colors ${
                          selectedMSI === null
                            ? "border-even-grass bg-even-grass/10"
                            : "border-black/50 bg-surface hover:border-tone-400"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-black text-base md:text-lg">
                              Pago completo
                            </p>
                            <p className="text-xs md:text-sm text-tone-600">
                              ${totalAmount.toFixed(2)} MXN
                            </p>
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                              selectedMSI === null
                                ? "border-even-grass bg-even-grass"
                                : "border-tone-300"
                            }`}
                          >
                            {selectedMSI === null && (
                              <div className="w-full h-full rounded-full bg-white scale-50" />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-tone-300" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                          <span className="px-2 bg-white text-tone-500">
                            Pago a meses
                          </span>
                        </div>
                      </div>

                      {availableOptions.map((option) => {
                        const totalWithCommission =
                          computeMsiTotal(totalAmount, option.rate);
                        const monthlyPayment =
                          totalWithCommission / option.months;
                        return (
                          <div
                            key={option.months}
                            onClick={() => setSelectedMSI(option.months)}
                            className={`py-2 px-5 border rounded-full cursor-pointer transition-colors ${
                              selectedMSI === option.months
                                ? "border-even-grass bg-even-grass/10"
                                : "border-black/50 bg-surface hover:border-tone-400"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-black text-base md:text-lg">
                                  ${monthlyPayment.toFixed(2)} MXN x{" "}
                                  {option.months} meses
                                </p>
                                <p className="text-xs md:text-sm text-tone-600">
                                  Total ${totalWithCommission.toFixed(2)} MXN
                                </p>
                              </div>
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                  selectedMSI === option.months
                                    ? "border-even-grass bg-even-grass"
                                    : "border-tone-300"
                                }`}
                              >
                                {selectedMSI === option.months && (
                                  <div className="w-full h-full rounded-full bg-white scale-50" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {availableOptions.length < msiOptions.length &&
                        totalAmount < minAmountNeeded && (
                          <p className="text-xs md:text-sm text-tone-500 text-center mt-2">
                            Monto mínimo ${minAmountNeeded.toFixed(2)} MXN para
                            pagos a meses
                          </p>
                        )}
                    </div>
                  );
                })()}
              </div>
              <div className="px-6 py-4 border-t border-tone-200 sticky bottom-0 bg-white">
                <button
                  onClick={() => setShowPaymentOptionsModal(false)}
                  className="w-full bg-even-grass text-even-evergreen py-3 rounded-full cursor-pointer transition-colors text-base"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de error */}
      {errorMessage && (
        <div
          className="fixed inset-0 z-99999 flex items-end justify-center bg-black/50"
          onClick={() => {
            // Una vez que la orden se confirma, el botón de pagar
            // no debe estar disponible — eso ya lo decidió el código que lo abrió.
            setErrorMessage(null);
            setErrorTitle("Error al procesar el pago");
          }}
        >
          <div
            className="bg-white rounded-t-4xl w-full max-w-(--app-max-w) mx-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 max-w-2xl mx-auto">
              <div className="flex flex-col items-center mb-4">
                <div className="w-14 h-14 rounded-full bg-danger-100 flex items-center justify-center mb-4">
                  <CircleAlert
                    className="size-7 text-danger-500"
                    strokeWidth={2}
                  />
                </div>
                <h2 className="text-xl font-semibold text-black text-center">
                  {errorTitle}
                </h2>
              </div>
              <div className="bg-surface border border-stroke-soft/50 rounded-xl p-4 mb-6">
                <p className="text-tone-700 text-sm text-center">
                  {errorMessage}
                </p>
              </div>
              {/* Una vez que la orden se confirma, el botón de pagar
                  no debe estar disponible — eso ya lo decidió el código que lo abrió. */}
              <button
                onClick={() => {
                  // Una vez que la orden se confirma, el botón de pagar
                  // no debe estar disponible — eso ya lo decidió el código que lo abrió.
                  setErrorMessage(null);
                  setErrorTitle("Error al procesar el pago");
                }}
                className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
              >
                {canRetryCharge ? "Intentar de nuevo" : "Entendido"}
              </button>
            </div>
          </div>
        </div>
      )}

      <RestaurantClosedModal
        isOpen={showClosedModal}
        onClose={() => setShowClosedModal(false)}
        openingHours={restaurant?.opening_hours}
        restaurantName={restaurant?.name}
        restaurantLogo={restaurant?.logo_url}
      />
      <UnavailableItemsModal
        isOpen={showUnavailableModal}
        onClose={() => setShowUnavailableModal(false)}
        items={toUnavailableModalItems(unavailableItems)}
        showImages={restaurant?.menu_show_images !== false}
        onRemove={async () => {
          for (const item of unavailableItems) {
            if (item.cartItemId) await updateQuantity(item.cartItemId, 0);
          }
        }}
      />
      <POSBlockedModal
        isOpen={showPOSModal}
        onClose={() => setShowPOSModal(false)}
        reason={isTurnoClosed ? "turno_closed" : "agent_disconnected"}
        restaurantName={restaurant?.name}
        restaurantLogo={restaurant?.logo_url}
      />
    </>
  );
}

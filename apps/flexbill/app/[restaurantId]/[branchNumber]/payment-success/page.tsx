"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useGuest, useIsGuest } from "@/app/context/GuestContext";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { getRestaurantData } from "@/app/utils/restaurantData";
import { apiService } from "@/app/utils/api";
import { X, LogIn, UserCircle2 } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import InvoiceModal from "@/app/components/modals/InvoiceModal";
import { AddLoyaltyCardButton } from "@even/ui/diner";
import { walletCardService } from "@/app/services/walletCard.service";
import { invoiceService } from "@/app/services/invoice.service";
import { ticketService } from "@/app/services/ticket.service";
import { lockScroll, unlockScroll, useModalBackClose } from "@even/ui";
import PaidReceipt from "@/app/components/PaidReceipt";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";

export default function PaymentSuccessPage() {
  const t = useTranslations("PaymentSuccessPage");
  // skipSessionCheck: al pagar se revoca la sesión de mesa de inmediato (por
  // diseño), y esta pantalla solo muestra el ticket ya pagado — no necesita
  // poder ordenar. Ver even-backend/src/controllers/shared/restaurantController.js.
  const { validationError, restaurantId } = useValidateAccess({
    skipSessionCheck: true,
  });
  const { restaurant } = useRestaurant();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const { state, loadTableData } = useTable();
  const { navigateWithTable } = useTableNavigation();
  const router = useRouter();
  const searchParams = useSearchParams();

  // La cuenta puede haber quedado cerrada por este mismo pago (remaining <=
  // 0 en close_table_order_if_paid). En ese caso ya no tiene sentido mandar
  // al guest de vuelta al menú de esta mesa. Recargamos acá en vez de
  // confiar en que card-selection ya haya terminado su refresh en background
  // para cuando se monta esta pantalla.
  // `acceptEmpty`: si este pago cerró la cuenta, el backend responde sin
  // órdenes y eso es lo correcto; sin la opción se descartaba como "carrera"
  // y el menú seguía mostrando la cuenta pagada como pendiente.
  const hasLoadedTableDataRef = useRef(false);
  useEffect(() => {
    if (state.tableNumber && !hasLoadedTableDataRef.current) {
      hasLoadedTableDataRef.current = true;
      loadTableData({ acceptEmpty: true });
    }
  }, [state.tableNumber, loadTableData]);

  // Al salir (botón, gesto de regreso, etc.) se vuelve a pedir el estado: el
  // cierre de la cuenta puede llegar al backend después de montar esta pantalla.
  const loadTableDataRef = useRef(loadTableData);
  loadTableDataRef.current = loadTableData;
  useEffect(() => {
    return () => {
      if (hasLoadedTableDataRef.current) {
        loadTableDataRef.current({ acceptEmpty: true }).catch(() => {});
      }
    };
  }, []);
  const isTableClosed = state.tableSummary?.data?.data?.status === "paid";
  const restaurantData = getRestaurantData();
  const isGuest = useIsGuest();
  const { guestId, tableNumber } = useGuest();

  // Get payment details from URL or localStorage
  const paymentId =
    searchParams.get("paymentId") || searchParams.get("orderId");
  const urlAmount = parseFloat(searchParams.get("amount") || "0");

  // Try to get stored payment details
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(
    null,
  );
  const cameFromAuth =
    typeof window !== "undefined" &&
    sessionStorage.getItem("even-post-auth-redirect");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isDownloadingTicket, setIsDownloadingTicket] = useState(false);

  const handleDownloadTicket = async () => {
    const transactionId =
      paymentDetails?.transactionId || paymentDetails?.paymentId || paymentId;
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

  // Limpiar el flag de redirect después de cargar
  useEffect(() => {
    if (cameFromAuth) {
      sessionStorage.removeItem("even-post-auth-redirect");
    }
  }, [cameFromAuth]);

  // TEMPORAL: el modal de registro se abre solo y tapa la animación del ticket.
  // Reactivar cuando se decida dónde mostrarlo (p. ej. tras el sello PAGADO).
  const AUTO_OPEN_REGISTER_MODAL = false;
  useEffect(() => {
    if (!AUTO_OPEN_REGISTER_MODAL) return;
    if (isAuthLoading) return;
    if (!isAuthenticated && !cameFromAuth) {
      setIsRegisterModalOpen(true);
    }
  }, [isAuthLoading, isAuthenticated, cameFromAuth]);

  // Handler for sign up navigation
  const handleSignUp = () => {
    // Save the current URL to redirect back after registration
    const currentUrl = window.location.pathname + window.location.search;
    sessionStorage.setItem("even-post-auth-redirect", currentUrl);

    // Navigate to auth page
    navigateWithTable("/auth");
  };

  useEffect(() => {
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      width: document.body.style.width,
      height: document.body.style.height,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.width = prev.width;
      document.body.style.height = prev.height;
    };
  }, []);

  // El pago ya se realizó: no debe ser posible regresar con el back
  // button/gesto nativo a card-selection, tip-selection u otra pantalla
  // previa del flujo de pago. Cualquier intento de ir atrás desde acá
  // redirige al menú.
  const navigateWithTableRef = useRef(navigateWithTable);
  navigateWithTableRef.current = navigateWithTable;

  // Capa base del stack de useModalBackClose: así cerrar un modal (X/backdrop)
  // no dispara esta redirección, y el back con un modal abierto solo lo cierra.
  useModalBackClose(true, () => navigateWithTableRef.current("/menu", true));

  useEffect(() => {
    if (isRegisterModalOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isRegisterModalOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Get payment ID from URL to identify this specific payment
      const urlPaymentId = paymentId || searchParams.get("transactionId");

      let storedPayment = null;
      let storageKey = "";
      let fromSession = true;

      // First, try to find the current payment key reference
      const currentKeyRef = sessionStorage.getItem("even-current-payment-key");
      if (currentKeyRef) {
        storedPayment = sessionStorage.getItem(currentKeyRef);
        storageKey = currentKeyRef;
      }

      // If not found, search all sessionStorage keys for payment success data
      if (!storedPayment) {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith("even-payment-success-")) {
            storedPayment = sessionStorage.getItem(key);
            storageKey = key;
            break;
          }
        }
      }

      // If still not found, check localStorage (first time)
      if (!storedPayment) {
        fromSession = false;

        // Check for completed payment first (most recent flow)
        storedPayment = localStorage.getItem("even-completed-payment");
        storageKey = "even-completed-payment";

        // Check for pending payment (EcartPay redirect flow)
        if (!storedPayment) {
          storedPayment = localStorage.getItem("even-pending-payment");
          storageKey = "even-pending-payment";
        }

        // Check for payment intent (SDK flow)
        if (!storedPayment) {
          storedPayment = localStorage.getItem("even-payment-intent");
          storageKey = "even-payment-intent";
        }
      }

      if (storedPayment) {
        try {
          const parsed = JSON.parse(storedPayment);
          setPaymentDetails(parsed);

          // If from localStorage (first time), save to sessionStorage for persistence
          if (!fromSession) {
            // Save with unique key based on payment/transaction ID
            const paymentIdentifier =
              parsed.paymentId ||
              parsed.transactionId ||
              urlPaymentId ||
              Date.now().toString();
            const uniqueKey = `even-payment-success-${paymentIdentifier}`;

            sessionStorage.setItem(uniqueKey, storedPayment);

            // Also save the current payment key reference
            sessionStorage.setItem("even-current-payment-key", uniqueKey);

            // Clean up localStorage
            localStorage.removeItem("even-pending-payment");
            localStorage.removeItem("even-payment-intent");
            localStorage.removeItem("even-completed-payment");

            // Clear session data after successful payment — pero NO para
            // "Dividir cuenta": pagar tu parte no significa que terminaste de
            // interactuar con la mesa (otros pueden faltar por pagar, o puedes
            // volver a la pantalla). Limpiar el guest-id aquí lo regeneraba en
            // la siguiente visita, creando un participante duplicado.
            if (parsed.paymentType !== "equal-shares") {
              clearGuestSession();
            }
          }
        } catch (e) {
          console.error("Failed to parse stored payment details:", e);
        }
      } else {
      }
    }
  }, [paymentId, searchParams]);

  const clearGuestSession = async () => {
    if (typeof window !== "undefined") {
      // Use apiService method for consistent cleanup
      apiService.clearGuestSession();

      // Also clear any additional payment-related data
      localStorage.removeItem("even-pending-payment");

      // For guest users, also cleanup eCartPay data
      if (isGuest && guestId) {
        try {
          await fetch("/api/payments/cleanup-guest", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              guestId: guestId,
            }),
          });
        } catch (error) {
          console.error("Failed to cleanup guest eCartPay data:", error);
        }
      }
    }
  };

  // Calculate total amount charged to client
  // Check if a factura already exists for this transaction
  useEffect(() => {
    const transactionId =
      paymentDetails?.transactionId || paymentDetails?.paymentId || paymentId;
    if (!transactionId) return;
    invoiceService
      .getTransactionInvoice(transactionId)
      .then((info) => {
        if (info?.invoiceId) setExistingInvoiceId(info.invoiceId);
      })
      .catch(() => {});
  }, [paymentDetails, paymentId]);

  const amount =
    paymentDetails?.totalAmountCharged || paymentDetails?.amount || urlAmount;

  // Get payment type from paymentDetails
  const paymentType = paymentDetails?.paymentType || "";

  // Get dish orders from paymentDetails based on payment type
  const getDisplayedDishOrders = () => {
    const allDishOrders = paymentDetails?.dishOrders || [];

    if (paymentType === "select-items") {
      // For select-items, filter only the selected items
      const selectedItemIds = paymentDetails?.selectedItems || [];
      return allDishOrders.filter((dish: any) =>
        selectedItemIds.includes(dish.dish_order_id?.toString()),
      );
    } else if (paymentType === "full-bill") {
      // For full-bill, show all orders
      return allDishOrders;
    } else {
      // For equal-shares and choose-amount, don't show individual items
      return [];
    }
  };

  const dishOrders = getDisplayedDishOrders();

  const handleBackToMenu = () => {
    // Clear payment success data from sessionStorage
    const currentKey = sessionStorage.getItem("even-current-payment-key");
    if (currentKey) {
      sessionStorage.removeItem(currentKey);
      sessionStorage.removeItem("even-current-payment-key");
    }
    // Fallback: also remove generic key
    sessionStorage.removeItem("even-payment-success");

    // Since session is cleared, redirect to home page to select table again
    router.push("/");
  };

  const handleGoHome = () => {
    // Clear payment success data from sessionStorage
    const currentKey = sessionStorage.getItem("even-current-payment-key");
    if (currentKey) {
      sessionStorage.removeItem(currentKey);
      sessionStorage.removeItem("even-current-payment-key");
    }
    // Fallback: also remove generic key
    sessionStorage.removeItem("even-payment-success");

    // Complete exit - go to menu with table parameters
    navigateWithTable("/menu");
  };

  // Mostrar error de validación si existe
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <div className="h-dvh overflow-hidden brand-evergreen flex flex-col justify-center app-root">
      {/* Ticket que se imprime, se sella como PAGADO y se expande al tocarlo */}
      <div className="shrink-0 flex justify-center items-center px-6 md:px-8 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2">
        <div className="w-full max-w-xs md:max-w-sm">
          <PaidReceipt
            restaurantName={restaurant?.name || restaurantData.name}
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

      {/* Agradecimiento + Ir al menú, justo debajo del ticket */}
      <div className="px-6 md:px-8 lg:px-10 w-full max-w-md mx-auto animate-slide-up flex flex-col items-center gap-4 md:gap-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <h1 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-tight text-center">
          {t("heroTitle")}
        </h1>
        <button
          onClick={handleGoHome}
          disabled={isTableClosed}
          className="w-full py-3 md:py-4 lg:py-5 rounded-full transition-all bg-even-grass text-even-evergreen font-medium text-base md:text-lg lg:text-xl disabled:opacity-50 disabled:cursor-not-allowed enabled:cursor-pointer enabled:active:scale-90"
        >
          {t("goToMenuCta")}
        </button>
        {/* Tarjeta de lealtad: se pinta sola si el restaurante tiene programa activo */}
        <AddLoyaltyCardButton
          restaurantId={parseInt(restaurantId, 10)}
          walletCardService={walletCardService}
        />
      </div>

      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        transactionId={
          paymentDetails?.transactionId ||
          paymentDetails?.paymentId ||
          paymentId ||
          ""
        }
        restaurantId={restaurant?.id ?? 0}
        isAuthenticated={isAuthenticated}
        existingInvoiceId={existingInvoiceId}
        onInvoiceCreated={(id) => setExistingInvoiceId(id)}
      />

      {/* Register Modal */}
      {isRegisterModalOpen && (
        <>
<div className="fixed inset-0 bg-black/25 backdrop-blur-xs z-999 animate-fade-in" onClick={() => setIsRegisterModalOpen(false)} />
<div className="fixed inset-0 z-999 flex items-center justify-center pointer-events-none">
          <div
            className="pointer-events-auto bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-999 flex flex-col justify-center py-12 md:py-16 lg:py-20 min-h-[70vh] animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <div className="absolute top-3 md:top-4 lg:top-5 right-3 md:right-4 lg:right-5">
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-2 md:p-3 lg:p-4 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors"
              >
                <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
              </button>
            </div>

            {/* Logo */}
            <div className="px-6 md:px-8 lg:px-10 flex items-center justify-center mb-6 md:mb-8 lg:mb-10">
              <img
                src="/even/even-asterisk-grass.svg"
                alt="Even Logo"
                className="size-20 md:size-24 lg:size-28"
              />
            </div>

            {/* Title */}
            <div className="px-6 md:px-8 lg:px-10 text-center mb-6 md:mb-8 lg:mb-10">
              <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2 md:mb-3 lg:mb-4">
                {t("registerModalTitle")}
              </h1>
              <p className="text-white/80 text-sm md:text-base lg:text-lg">
                {t("registerModalSubtitle")}
              </p>
            </div>

            {/* Options */}
            <div className="px-6 md:px-8 lg:px-10 space-y-3 md:space-y-4 lg:space-y-5">
              {/* Sign Up Option */}
              <button
                onClick={handleSignUp}
                className="w-full bg-white hover:bg-tone-50 text-black py-4 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6 rounded-xl md:rounded-2xl transition-all duration-200 flex items-center gap-3 md:gap-4 lg:gap-5 active:scale-95"
              >
                <div className="bg-even-grass p-2 md:p-2.5 lg:p-3 rounded-full group-hover:scale-110 transition-transform">
                  <LogIn className="size-5 md:size-6 lg:size-7 text-even-evergreen" />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-base md:text-lg lg:text-xl font-medium mb-0.5 md:mb-1">
                    {t("createAccountCta")}
                  </h2>
                  <p className="text-xs md:text-sm lg:text-base text-tone-600">
                    {t("createAccountSubtitle")}
                  </p>
                </div>
              </button>

              {/* Continue as Guest Option */}
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="w-full bg-white/10 hover:bg-white/20 border-2 border-white text-white py-4 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6 rounded-xl md:rounded-2xl transition-all duration-200 flex items-center gap-3 md:gap-4 lg:gap-5 group active:scale-95"
              >
                <div className="bg-white/20 p-2 md:p-2.5 lg:p-3 rounded-full group-hover:scale-110 transition-transform">
                  <UserCircle2 className="size-5 md:size-6 lg:size-7 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-base md:text-lg lg:text-xl font-medium mb-0.5 md:mb-1">
                    {t("continueAsGuestCta")}
                  </h2>
                  <p className="text-xs md:text-sm lg:text-base text-white/80">
                    {t("continueAsGuestSubtitle")}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
</>
      )}
    </div>
  );
}

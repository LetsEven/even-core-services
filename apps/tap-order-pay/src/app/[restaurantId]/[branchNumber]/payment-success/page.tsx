"use client";

import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { clearCheckoutDraft } from "@even/cart";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import { useRestaurant } from "@/context/RestaurantContext";

/**
 * Paso intermedio tras pagar. Ya no muestra la vista "¡Gracias por tu pedido!": guarda los datos del
 * pago (para el ticket y Facturar) y regresa al menú con `?paid=1&order=<id>`, donde se muestra el
 * aviso de pago y se abre la cuenta de la mesa.
 */
export default function PaymentSuccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId, setBranchNumber } = useRestaurant();
  const { navigateWithTable } = useTableNavigation();
  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;
  const done = useRef(false);

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) setRestaurantId(parseInt(restaurantId));
    if (branchNumber && !isNaN(parseInt(branchNumber))) setBranchNumber(parseInt(branchNumber));
  }, [restaurantId, branchNumber, setRestaurantId, setBranchNumber]);

  useEffect(() => {
    if (done.current || typeof window === "undefined") return;
    done.current = true;
    clearCheckoutDraft();

    const paymentId = searchParams.get("paymentId") || searchParams.get("orderId");
    const urlPaymentId = paymentId || searchParams.get("transactionId");
    const sessionKey = urlPaymentId ? `even-payment-success-${urlPaymentId}` : "even-payment-success";

    let paymentDetails: any = null;
    let stored = sessionStorage.getItem(sessionKey);
    if (stored) {
      try {
        paymentDetails = JSON.parse(stored);
      } catch {
        // ignorar datos corruptos
      }
    } else {
      // Primera vez: completed → pending (redirect EcartPay) → intent (SDK)
      stored =
        localStorage.getItem("even-completed-payment") ||
        localStorage.getItem("even-pending-payment") ||
        localStorage.getItem("even-payment-intent");
      if (stored) {
        try {
          paymentDetails = JSON.parse(stored);
          const identifier =
            paymentDetails.paymentId || paymentDetails.transactionId || urlPaymentId || Date.now().toString();
          const uniqueKey = `even-payment-success-${identifier}`;
          sessionStorage.setItem(uniqueKey, stored);
          sessionStorage.setItem("even-current-payment-key", uniqueKey);
          localStorage.removeItem("even-pending-payment");
          localStorage.removeItem("even-payment-intent");
          localStorage.removeItem("even-completed-payment");
        } catch (e) {
          console.error("Failed to parse stored payment details:", e);
        }
      }
    }

    const orderId: string | null = paymentId || paymentDetails?.orderId || null;
    navigateWithTable(orderId ? `/menu?paid=1&order=${encodeURIComponent(orderId)}` : "/menu?paid=1", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh brand-evergreen flex items-center justify-center">
      <img
        src="/even/even-asterisk-grass.svg"
        alt="Even"
        className="size-20 md:size-28 lg:size-32 animate-logo-fade-in"
      />
    </div>
  );
}

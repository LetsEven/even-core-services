"use client";

import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useNavigation } from "../../../hooks/useNavigation";
import { useRestaurant } from "../../../context/RestaurantContext";
import { useGuest, useIsGuest } from "../../../context/GuestContext";
import { authService } from "../../../services/auth.service";
import { pickAndGoService } from "../../../services/pickandgo.service";

/**
 * Paso intermedio tras pagar. Ya no muestra la vista "¡Gracias por tu
 * pedido!": persiste los datos del pago (para el ticket), limpia la sesión de
 * guest y regresa al menú con `?order=<id>`, donde se abre automáticamente el
 * detalle del pedido en curso (estatus + ticket).
 */
export default function PaymentSuccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId } = useRestaurant();
  const { navigateWithRestaurantId } = useNavigation();
  const isGuest = useIsGuest();
  const { guestId } = useGuest();
  const restaurantId = params?.restaurantId as string;
  const done = useRef(false);

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) {
      setRestaurantId(parseInt(restaurantId));
    }
  }, [restaurantId, setRestaurantId]);

  const paymentId =
    searchParams.get("paymentId") || searchParams.get("orderId");

  useEffect(() => {
    if (done.current || typeof window === "undefined") return;
    done.current = true;

    const run = async () => {
      const urlPaymentId = paymentId || searchParams.get("transactionId");
      const sessionKey = urlPaymentId
        ? `even-payment-success-${urlPaymentId}`
        : "even-payment-success";

      let storedPayment = sessionStorage.getItem(sessionKey);
      let paymentDetails: any = null;

      if (storedPayment) {
        try {
          paymentDetails = JSON.parse(storedPayment);
        } catch {
          // ignorar datos corruptos
        }
      } else {
        // Primera vez: completed → pending (redirect EcartPay) → intent (SDK)
        storedPayment =
          localStorage.getItem("even-completed-payment") ||
          localStorage.getItem("even-pending-payment") ||
          localStorage.getItem("even-payment-intent");

        if (storedPayment) {
          try {
            paymentDetails = JSON.parse(storedPayment);
            const identifier =
              paymentDetails.paymentId ||
              paymentDetails.transactionId ||
              urlPaymentId ||
              Date.now().toString();
            const uniqueKey = `even-payment-success-${identifier}`;
            sessionStorage.setItem(uniqueKey, storedPayment);
            sessionStorage.setItem("even-current-payment-key", uniqueKey);
            if (urlPaymentId && uniqueKey !== sessionKey) {
              sessionStorage.setItem(sessionKey, storedPayment);
            }
            localStorage.removeItem("even-pending-payment");
            localStorage.removeItem("even-payment-intent");
            localStorage.removeItem("even-completed-payment");

            authService.clearAllSessionData();
            if (isGuest && guestId) {
              try {
                await fetch("/api/payments/cleanup-guest", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ guestId }),
                });
              } catch (error) {
                console.error("Failed to cleanup guest eCartPay data:", error);
              }
            }
          } catch (e) {
            console.error("Failed to parse stored payment details:", e);
          }
        }
      }

      // Si la URL no trae el id del pedido, tomarlo del pago o del último pedido
      let orderId: string | null = paymentId || paymentDetails?.orderId || null;
      if (!orderId && restaurantId && guestId) {
        try {
          const last = await pickAndGoService.getUserOrders(guestId, {
            limit: 1,
            restaurant_id: parseInt(restaurantId),
          });
          if (last.success && last.data?.length) orderId = last.data[0].id;
        } catch {
          // sin id: se abre el menú normal
        }
      }

      navigateWithRestaurantId(
        orderId ? `/menu?order=${encodeURIComponent(orderId)}` : "/menu",
        { replace: true },
      );
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh flex items-center justify-center">
      <img
        src="/even/even-asterisk-grass.svg"
        alt="Even"
        className="size-20 md:size-28 lg:size-32 animate-logo-fade-in"
      />
    </div>
  );
}

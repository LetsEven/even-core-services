"use client";

import { AuthStepCard, usePhoneAuth } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { authService } from "@/services/auth.service";
import { useRestaurant } from "@/context/RestaurantContext";
import { useAuth } from "@/context/AuthContext";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { useGuest } from "@/context/GuestContext";

/**
 * Inicio de sesión / registro desde el menú o tras pagar. Las vistas y el estado (teléfono → código → perfil) viven
 * en `@even/ui/diner`; aquí quedan el servicio de Tap Order & Pay y a dónde volver al terminar.
 */
export default function AuthPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { navigateWithTable } = useTableNavigation();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId, setBranchNumber } = useRestaurant();
  const { verifyOTP, createOrUpdateProfile, refreshProfile, isAuthenticated, isLoading, profile } = useAuth();
  const { guestName } = useGuest();

  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;
  const tableNumber = searchParams.get("table");
  const authCompletedRef = useRef(false);

  // Store context
  useEffect(() => {
    if (tableNumber) {
      sessionStorage.setItem("pendingTableRedirect", tableNumber);
    }
    if (restaurantId) {
      sessionStorage.setItem("pendingRestaurantId", restaurantId);
      setRestaurantId(parseInt(restaurantId));
    }
    if (branchNumber) {
      setBranchNumber(parseInt(branchNumber));
    }
  }, [tableNumber, restaurantId, branchNumber, setRestaurantId, setBranchNumber]);

  // Limpia el contexto de auth pendiente en sessionStorage si se sale sin terminar: el botón/gesto atrás dispara
  // `popstate`; cerrar o recargar la pestaña, `beforeunload`.
  useEffect(() => {
    const cleanupAuthSession = () => {
      if (authCompletedRef.current) return;
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("even-post-auth-redirect");
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
    };
    window.addEventListener("popstate", cleanupAuthSession);
    window.addEventListener("beforeunload", cleanupAuthSession);
    return () => {
      window.removeEventListener("popstate", cleanupAuthSession);
      window.removeEventListener("beforeunload", cleanupAuthSession);
    };
  }, []);

  // Helper function to handle post-auth redirects
  const handleAuthRedirect = () => {
    // Mark auth as completed so cleanup doesn't remove session items
    authCompletedRef.current = true;

    const postAuthRedirect = sessionStorage.getItem("even-post-auth-redirect");

    if (postAuthRedirect) {
      sessionStorage.removeItem("even-post-auth-redirect");
      // replace: un "atrás" posterior salta por encima de esta pantalla.
      router.replace(postAuthRedirect);
      return;
    }

    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    // Clear all session flags
    sessionStorage.removeItem("pendingTableRedirect");
    sessionStorage.removeItem("pendingRestaurantId");
    sessionStorage.removeItem("authFromPaymentFlow");
    sessionStorage.removeItem("authFromMenu");
    sessionStorage.removeItem("even-post-auth-redirect");

    if (authFromMenu && tableNumber) {
      // User signed in from MenuView settings, redirect to dashboard
      navigateWithTable("/dashboard", true);
    } else if (authFromPaymentFlow && tableNumber) {
      navigateWithTable("/order-confirm", true);
    } else {
      // Default redirect to menu
      navigateWithTable("/order", true);
    }
  };

  const auth = usePhoneAuth({
    sendOtp: (phone) => authService.sendPhoneOTP(phone),
    verifyOtp: verifyOTP,
    saveProfile: createOrUpdateProfile,
    refreshProfile,
    session: { isAuthenticated, isLoading, profile },
    onAuthenticated: handleAuthRedirect,
  });

  return (
    <div className="min-h-new brand-evergreen flex flex-col">
      <MenuHeaderBack />
      <AuthStepCard
        variant="login"
        auth={auth}
        guest={{
          label: t("continueAsGuest"),
          onClick: () => navigateWithTable(guestName ? "/order-confirm" : "/user"),
        }}
      />
    </div>
  );
}

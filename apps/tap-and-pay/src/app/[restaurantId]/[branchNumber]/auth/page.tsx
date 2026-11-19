"use client";

import { AuthStepCard, unwrapProfile, usePhoneAuth } from "@even/ui/diner";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authService } from "@/app/services/auth.service";
import { useAuth } from "@/app/context/AuthContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import MenuHeader from "@/app/components/headers/MenuHeader";

/**
 * Inicio de sesión / registro desde el menú o tras pagar. Las vistas y el estado (teléfono → código → perfil) viven
 * en `@even/ui/diner`; aquí quedan el servicio de Tap & Pay y a dónde volver al terminar.
 */
export default function AuthPage() {
  const router = useRouter();
  const { navigateWithTable } = useTableNavigation();
  const searchParams = useSearchParams();
  const { verifyOTP, createOrUpdateProfile, refreshProfile } = useAuth();
  const tableNumber = searchParams.get("table");
  const authCompletedRef = useRef(false);

  // Limpia los flags de sessionStorage que dirigen el redirect post-auth si se sale sin completar el login (botón/
  // gesto atrás → `popstate`; cerrar o recargar la pestaña → `beforeunload`). Si el login se completó, los consume
  // handleAuthRedirect.
  useEffect(() => {
    const cleanupAuthFlags = () => {
      if (authCompletedRef.current) return;
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("even-post-auth-redirect");
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
    };
    window.addEventListener("popstate", cleanupAuthFlags);
    window.addEventListener("beforeunload", cleanupAuthFlags);
    return () => {
      window.removeEventListener("popstate", cleanupAuthFlags);
      window.removeEventListener("beforeunload", cleanupAuthFlags);
    };
  }, []);

  // Helper function to handle post-auth redirects
  const handleAuthRedirect = () => {
    // Mark auth as completed so cleanup doesn't remove session items
    authCompletedRef.current = true;

    const postAuthRedirect = sessionStorage.getItem("even-post-auth-redirect");

    if (postAuthRedirect) {
      sessionStorage.removeItem("even-post-auth-redirect");
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("authFromMenu");
      // replace: un "atrás" posterior no vuelve a pasar por esta pantalla.
      router.replace(postAuthRedirect);
      return;
    }

    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    sessionStorage.removeItem("pendingTableRedirect");
    sessionStorage.removeItem("pendingRestaurantId");
    sessionStorage.removeItem("authFromPaymentFlow");
    sessionStorage.removeItem("authFromMenu");
    sessionStorage.removeItem("even-post-auth-redirect");

    if (authFromMenu && tableNumber) {
      navigateWithTable("/dashboard", true);
    } else if (authFromPaymentFlow && tableNumber) {
      navigateWithTable("/card-selection", true);
    } else {
      navigateWithTable("/menu", true);
    }
  };

  const auth = usePhoneAuth({
    sendOtp: (phone) => authService.sendPhoneOTP(phone),
    verifyOtp: verifyOTP,
    hasProfile: async () => {
      const response = await authService.getMyProfile();
      return response.success && !!unwrapProfile(response.data)?.firstName;
    },
    saveProfile: createOrUpdateProfile,
    refreshProfile,
    onAuthenticated: handleAuthRedirect,
  });

  return (
    <div className="min-h-dvh bg-even-evergreen flex flex-col app-root">
      <MenuHeader />
      <AuthStepCard variant="login" auth={auth} example />
    </div>
  );
}

"use client";

import { AuthStepCard, unwrapProfile, usePhoneAuth } from "@even/ui/diner";
import { useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { authService } from "@/app/services/auth.service";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useTable } from "@/app/context/TableContext";
import { useAuth } from "@/app/context/AuthContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { getRestaurantData } from "@/app/utils/restaurantData";

/**
 * Inicio de sesión / registro desde el menú o tras pagar. Las vistas y el estado (teléfono → código → perfil) viven
 * en `@even/ui/diner`; aquí quedan el servicio de FlexBill y a dónde volver al terminar.
 */
export default function AuthPage() {
  const router = useRouter();
  const { navigateWithTable } = useTableNavigation();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId, setBranchNumber } = useRestaurant();
  const { state } = useTable();
  const restaurantData = getRestaurantData();
  const { verifyOTP, createOrUpdateProfile, refreshProfile } = useAuth();

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

  // Limpia los flags de sessionStorage cuando se abandona la página sin
  // completar el auth (se usan para decidir a dónde redirigir después del
  // login — ver handleAuthRedirect). No se limpian si el auth sí se
  // completó (authCompletedRef), ya que handleAuthRedirect los necesita
  // primero y los borra él mismo. Salir con el botón/gesto atrás dispara
  // `popstate`; cerrar o recargar la pestaña, `beforeunload`.
  useEffect(() => {
    const cleanupPendingAuthFlags = () => {
      if (authCompletedRef.current) return;
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("even-post-auth-redirect");
    };
    window.addEventListener("popstate", cleanupPendingAuthFlags);
    window.addEventListener("beforeunload", cleanupPendingAuthFlags);
    return () => {
      window.removeEventListener("popstate", cleanupPendingAuthFlags);
      window.removeEventListener("beforeunload", cleanupPendingAuthFlags);
    };
  }, []);

  // A dónde ir al terminar el login según el contexto del que se llegó.
  const handleAuthRedirect = () => {
    // Mark auth as completed so cleanup doesn't remove session items
    authCompletedRef.current = true;

    const postAuthRedirect = sessionStorage.getItem("even-post-auth-redirect");

    if (postAuthRedirect) {
      sessionStorage.removeItem("even-post-auth-redirect");
      // replace: un "atrás" posterior salta a la pantalla previa al auth sin pasar de nuevo por aquí.
      router.replace(postAuthRedirect);
      return;
    }

    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    // Clear all session flags
    sessionStorage.removeItem("pendingTableRedirect");
    sessionStorage.removeItem("authFromPaymentFlow");
    sessionStorage.removeItem("authFromMenu");
    sessionStorage.removeItem("even-post-auth-redirect");

    if (authFromMenu && tableNumber) {
      // User signed in from MenuView settings, redirect to dashboard
      navigateWithTable("/dashboard", true);
    } else if (authFromPaymentFlow && tableNumber) {
      // User signed up during payment flow, redirect to card-selection
      navigateWithTable("/card-selection", true);
    } else {
      // Default redirect to menu
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
    <div className="min-h-dvh brand-evergreen flex flex-col app-root">
      <MenuHeaderBack restaurant={restaurantData} tableNumber={state.tableNumber} />
      <AuthStepCard variant="login" auth={auth} example />
    </div>
  );
}

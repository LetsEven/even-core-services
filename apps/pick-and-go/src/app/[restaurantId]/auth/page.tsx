"use client";

import { AuthStepCard, unwrapProfile, usePhoneAuth } from "@even/ui/diner";
import { useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { authService } from "@/services/auth.service";
import { useRestaurant } from "@/context/RestaurantContext";
import { useAuth } from "@/context/AuthContext";
import { useAuthLoginCopy } from "@/hooks/useAuthCopy";
import { useNavigation } from "@/hooks/useNavigation";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";

/**
 * Inicio de sesión / registro desde el menú o el panel. Las vistas y el estado (teléfono → código → perfil) viven en
 * `@even/ui/diner`; aquí quedan el servicio de Pick & Go y a dónde volver al terminar.
 */
export default function AuthPage() {
  const router = useRouter();
  const { navigateWithRestaurantId } = useNavigation();
  const params = useParams();
  const { setRestaurantId } = useRestaurant();
  const { verifyOTP, createOrUpdateProfile, refreshProfile } = useAuth();

  const restaurantId = params?.restaurantId as string;
  const authCompletedRef = useRef(false);

  // Store context
  useEffect(() => {
    if (restaurantId) {
      sessionStorage.setItem("pendingRestaurantId", restaurantId);
      setRestaurantId(parseInt(restaurantId));
    }
  }, [restaurantId, setRestaurantId]);

  // Limpia el contexto de auth pendiente si se sale sin completar el login (botón/gesto atrás → `popstate`;
  // cerrar o recargar la pestaña → `beforeunload`).
  useEffect(() => {
    const cleanup = () => {
      if (authCompletedRef.current) return;
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("even-post-auth-redirect");
      sessionStorage.removeItem("pendingRestaurantId");
    };
    window.addEventListener("popstate", cleanup);
    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("popstate", cleanup);
      window.removeEventListener("beforeunload", cleanup);
    };
  }, []);

  // Helper function to handle post-auth redirects
  const handleAuthRedirect = () => {
    // Mark auth as completed so cleanup doesn't remove session items
    authCompletedRef.current = true;

    const postAuthRedirect = sessionStorage.getItem("even-post-auth-redirect");

    if (postAuthRedirect) {
      sessionStorage.removeItem("even-post-auth-redirect");
      // Navigate directly to the saved URL
      router.push(postAuthRedirect);
      return;
    }

    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    // Clear all session flags
    sessionStorage.removeItem("pendingRestaurantId");
    sessionStorage.removeItem("authFromPaymentFlow");
    sessionStorage.removeItem("authFromMenu");
    sessionStorage.removeItem("even-post-auth-redirect");

    if (authFromMenu) {
      // User signed in from MenuView settings, redirect to dashboard
      navigateWithRestaurantId("/dashboard");
    } else if (authFromPaymentFlow) {
      // User signed up during payment flow, redirect to order confirmation
      navigateWithRestaurantId("/order-confirm");
    } else {
      // Default redirect to menu
      navigateWithRestaurantId("/menu");
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
    <div className="min-h-new brand-evergreen flex flex-col">
      <MenuHeaderBack />
      <AuthStepCard variant="login" auth={auth} example copy={useAuthLoginCopy()} />
    </div>
  );
}

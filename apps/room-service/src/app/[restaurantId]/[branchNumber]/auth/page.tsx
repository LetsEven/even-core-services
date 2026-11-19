"use client";

import { AuthStepCard, unwrapProfile, usePhoneAuth } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { authService } from "@/services/auth.service";
import { useRestaurant } from "@/context/RestaurantContext";
import { useAuth } from "@/context/AuthContext";
import { useRoomNavigation } from "@/hooks/useRoomNavigation";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { useGuest } from "@/context/GuestContext";

/**
 * Inicio de sesión / registro desde el menú o el carrito. Las vistas y el estado (teléfono → código → perfil) viven
 * en `@even/ui/diner`; aquí quedan el servicio de Room Service y a dónde volver al terminar.
 */
export default function AuthPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { navigateWithRoom } = useRoomNavigation();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setRestaurantId, setBranchNumber } = useRestaurant();
  const { verifyOTP, createOrUpdateProfile, refreshProfile, profile, isAuthenticated, isLoading } = useAuth();
  const { guestName } = useGuest();

  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;
  const roomNumber = searchParams.get("room");
  const authCompletedRef = useRef(false);

  // Store context
  useEffect(() => {
    if (roomNumber) {
      sessionStorage.setItem("pendingRoomRedirect", roomNumber);
    }
    if (restaurantId) {
      sessionStorage.setItem("pendingRestaurantId", restaurantId);
      setRestaurantId(parseInt(restaurantId));
    }
    if (branchNumber) {
      setBranchNumber(parseInt(branchNumber));
    }
  }, [roomNumber, restaurantId, branchNumber, setRestaurantId, setBranchNumber]);

  // Flags de sessionStorage usados para decidir a dónde volver una vez que el usuario termina teléfono+perfil
  // (ver handleAuthRedirect). Si abandona el flujo (botón/gesto atrás → `popstate`, cierra o recarga la pestaña →
  // `beforeunload`) se limpian para que no contaminen un intento de auth futuro.
  const clearAuthSessionFlags = () => {
    sessionStorage.removeItem("authFromPaymentFlow");
    sessionStorage.removeItem("authFromMenu");
    sessionStorage.removeItem("even-post-auth-redirect");
    sessionStorage.removeItem("pendingRoomRedirect");
    sessionStorage.removeItem("pendingRestaurantId");
  };

  useEffect(() => {
    const cleanup = () => {
      if (!authCompletedRef.current) clearAuthSessionFlags();
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
      // replace: un "atrás" posterior salta por encima de esta pantalla.
      router.replace(postAuthRedirect);
      return;
    }

    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    clearAuthSessionFlags();

    if (authFromMenu && roomNumber) {
      // User signed in from MenuView settings, redirect to dashboard
      navigateWithRoom("/dashboard", true);
    } else if (authFromPaymentFlow && roomNumber) {
      navigateWithRoom("/order-confirm", true);
    } else {
      // Default redirect to menu
      navigateWithRoom("/menu", true);
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
    // CartView manda aquí a quien ya tiene sesión pero perfil incompleto: salta directo al paso del perfil.
    session: { isAuthenticated, isLoading, profile, decideAfterVerify: false },
    onAuthenticated: handleAuthRedirect,
  });

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col app-root">
      <MenuHeaderBack />
      <AuthStepCard
        variant="login"
        auth={auth}
        guest={{
          label: t("continueAsGuest"),
          onClick: () => navigateWithRoom(guestName ? "/order-confirm" : "/user"),
        }}
      />
    </div>
  );
}

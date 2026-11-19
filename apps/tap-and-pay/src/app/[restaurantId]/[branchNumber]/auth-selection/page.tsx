"use client";

import { AuthStepCard, unwrapProfile, usePhoneAuth, type AuthenticatedInfo } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import MenuHeader from "@/app/components/headers/MenuHeader";
import { authService } from "@/app/services/auth.service";
import { orderService } from "@/app/services/order.service";
import { useAuth } from "@/app/context/AuthContext";
import { useTable } from "@/app/context/TableContext";

/**
 * Acceso antes de pagar la cuenta: teléfono → código SMS → perfil, o "Continuar como invitado". Las vistas y el
 * estado del inicio de sesión viven en `@even/ui/diner`; aquí quedan el servicio de Tap & Pay y alta del usuario
 * en la cuenta de la mesa (`active_users`).
 */
export default function AuthSelectionPage() {
  const t = useTranslations("Auth");
  const { navigateWithTable } = useTableNavigation();
  const { user, profile, isAuthenticated, isLoading, verifyOTP, createOrUpdateProfile, refreshProfile } = useAuth();
  const { state, loadActiveUsers } = useTable();
  // Id del usuario recién verificado: el contexto aún no lo trae dentro de este mismo render.
  const verifiedUserId = useRef<string | undefined>(undefined);

  // Registra al usuario en la cuenta de la mesa con el nombre ya resuelto, para que pague con su identidad.
  const joinOrder = async ({ firstName, lastName }: AuthenticatedInfo = {}) => {
    const userId = verifiedUserId.current ?? user?.id;
    if (!state.order?.order_id || !userId) return;
    const name = firstName ? (lastName ? `${firstName} ${lastName}` : firstName) : (profile?.firstName ?? "");
    await orderService.addActiveUser(state.order.order_id, userId, null, name);
    await loadActiveUsers();
  };

  const auth = usePhoneAuth({
    sendOtp: (phone) => authService.sendPhoneOTP(phone),
    verifyOtp: async (phone, code) => {
      const response = await verifyOTP(phone, code);
      verifiedUserId.current = response.data?.user?.id;
      return response;
    },
    hasProfile: async () => {
      const response = await authService.getMyProfile();
      const found = response.success ? unwrapProfile(response.data) : null;
      return found?.firstName ? found : false;
    },
    saveProfile: createOrUpdateProfile,
    refreshProfile,
    // Con sesión previa y perfil incompleto (falta nombre o fecha de nacimiento) salta directo al perfil.
    session: { isAuthenticated, isLoading, profile, decideAfterVerify: false },
    onAuthenticated: async (info) => {
      await joinOrder(info);
      // replace: un "atrás" posterior desde payment-options no vuelve a esta pantalla.
      navigateWithTable("/payment-options", true);
    },
  });

  return (
    <div className="min-h-dvh bg-even-evergreen flex flex-col app-root">
      <MenuHeader />
      <AuthStepCard
        variant="selection"
        auth={auth}
        guest={{ label: t("continueAsGuest"), onClick: () => navigateWithTable("/user") }}
      />
    </div>
  );
}

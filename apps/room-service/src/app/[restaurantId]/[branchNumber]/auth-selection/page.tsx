"use client";

import { AuthStepCard, unwrapProfile, usePhoneAuth } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import { useRoomNavigation } from "@/hooks/useRoomNavigation";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/context/AuthContext";
import { useGuest } from "@/context/GuestContext";

/**
 * Acceso antes de confirmar el pedido: teléfono → código SMS → perfil, o "Continuar como invitado". Las vistas y el
 * estado del inicio de sesión viven en `@even/ui/diner`; aquí solo quedan el servicio y las rutas de Room Service.
 */
export default function AuthSelectionPage() {
  const t = useTranslations("Auth");
  const { navigateWithRoom } = useRoomNavigation();
  const { validationError } = useValidateAccess();
  const { guestName } = useGuest();
  const { verifyOTP, createOrUpdateProfile, refreshProfile } = useAuth();

  const auth = usePhoneAuth({
    sendOtp: (phone) => authService.sendPhoneOTP(phone),
    verifyOtp: verifyOTP,
    hasProfile: async () => {
      const response = await authService.getMyProfile();
      return response.success && !!unwrapProfile(response.data)?.firstName;
    },
    saveProfile: createOrUpdateProfile,
    refreshProfile,
    onAuthenticated: () => navigateWithRoom("/order-confirm"),
  });

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col app-root">
      <MenuHeaderBack />
      <AuthStepCard
        variant="selection"
        auth={auth}
        guest={{
          label: t("continueAsGuest"),
          onClick: () => navigateWithRoom(guestName ? "/order-confirm" : "/user"),
        }}
      />
    </div>
  );
}

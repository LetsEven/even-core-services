"use client";

import { AuthStepCard, usePhoneAuth } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/context/AuthContext";
import { useGuest } from "@/context/GuestContext";

/**
 * Acceso antes de pagar: teléfono → código SMS → perfil, o "Continuar como invitado". Las vistas y el estado del
 * inicio de sesión viven en `@even/ui/diner`; aquí solo quedan el servicio y las rutas de Tap Order & Pay.
 */
export default function AuthSelectionPage() {
  const t = useTranslations("Auth");
  const { navigateWithTable } = useTableNavigation();
  const { validationError } = useValidateAccess();
  const { guestName } = useGuest();
  const { verifyOTP, createOrUpdateProfile, refreshProfile, profile, isAuthenticated, isLoading } = useAuth();

  const auth = usePhoneAuth({
    sendOtp: (phone) => authService.sendPhoneOTP(phone),
    verifyOtp: verifyOTP,
    saveProfile: createOrUpdateProfile,
    refreshProfile,
    // isAuthenticated/profile se actualizan juntos tras verificar el código (ver AuthContext.verifyOTP).
    session: { isAuthenticated, isLoading, profile },
    onAuthenticated: () => navigateWithTable("/order-confirm"),
  });

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <div className="min-h-new brand-evergreen flex flex-col">
      <MenuHeaderBack />
      <AuthStepCard
        variant="selection"
        auth={auth}
        guest={{
          label: t("continueAsGuest"),
          onClick: () => navigateWithTable(guestName ? "/order-confirm" : "/user"),
        }}
      />
    </div>
  );
}

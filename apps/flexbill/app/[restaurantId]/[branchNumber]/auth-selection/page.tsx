"use client";

import { AuthStepCard, unwrapProfile, usePhoneAuth } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { getRestaurantData } from "@/app/utils/restaurantData";
import { useTable } from "@/app/context/TableContext";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";
import { authService } from "@/app/services/auth.service";
import { useAuth } from "@/app/context/AuthContext";
import { useGuest } from "@/app/context/GuestContext";

/**
 * Acceso desde la cuenta de la mesa: teléfono → código SMS → perfil, o "Continuar como invitado". Las vistas y el
 * estado del inicio de sesión viven en `@even/ui/diner`; aquí solo está lo propio de FlexBill (servicio y rutas).
 */
export default function AuthSelectionPage() {
  const t = useTranslations("Auth");
  const tp = useTranslations("AuthSelectionPage");
  const { navigateWithTable } = useTableNavigation();
  const { validationError } = useValidateAccess();
  const { state, joinTableWithoutOrdering } = useTable();
  const { guestName } = useGuest();
  const restaurantData = getRestaurantData();
  const { verifyOTP, createOrUpdateProfile, refreshProfile } = useAuth();
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);

  // Si ya conocemos el nombre del invitado, únelo directo y pasa a pagar;
  // si no, captúralo primero reutilizando /user (modo "joinOnly").
  const handleContinueAsGuest = async () => {
    if (guestName) {
      setIsJoiningAsGuest(true);
      try {
        await joinTableWithoutOrdering(guestName);
        navigateWithTable("/payment-options");
      } finally {
        setIsJoiningAsGuest(false);
      }
    } else {
      navigateWithTable("/user?joinOnly=true");
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
    // replace: un "atrás" posterior desde payment-options salta a la cuenta sin pasar de nuevo por aquí.
    onAuthenticated: () => navigateWithTable("/payment-options", true),
  });

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col app-root">
      <MenuHeaderBack restaurant={restaurantData} tableNumber={state.tableNumber} />
      <AuthStepCard
        variant="selection"
        auth={auth}
        guest={{
          label: isJoiningAsGuest ? tp("continuingCta") : t("continueAsGuest"),
          onClick: handleContinueAsGuest,
          disabled: isJoiningAsGuest,
        }}
      />
    </div>
  );
}

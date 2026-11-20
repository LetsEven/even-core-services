"use client";

import { AuthModalView, usePhoneAuth } from "@even/ui/diner";
import LanguageToggleButton from "@even/i18n/language-toggle-button";
import { useAuth } from "@/context/AuthContext";

interface AuthViewProps {
  onClose: () => void;
}

/**
 * Inicio de sesión dentro del modal de ajustes del menú. Las vistas y el estado (teléfono → código → perfil) viven
 * en `@even/ui/diner`; aquí solo se enlaza con el contexto de auth de la app. Al terminar, el contexto pasa a
 * autenticado y el menú cambia al panel (no hay navegación).
 */
export default function AuthView({ onClose }: AuthViewProps) {
  const { sendOTP, verifyOTP, createOrUpdateProfile, refreshProfile, user, profile } = useAuth();

  const auth = usePhoneAuth({
    sendOtp: sendOTP,
    // El perfil llega con el contexto: tras verificar se recarga y el modal decide si pedir el perfil.
    verifyOtp: async (phone, code) => {
      const response = await verifyOTP(phone, code);
      if (response.success) await refreshProfile();
      return response;
    },
    saveProfile: createOrUpdateProfile,
    refreshProfile,
    onAuthenticated: () => {},
  });

  return (
    <AuthModalView
      auth={auth}
      onClose={onClose}
      signedIn={!!user}
      hasName={!!profile?.firstName}
      headerEnd={<LanguageToggleButton />}
    />
  );
}

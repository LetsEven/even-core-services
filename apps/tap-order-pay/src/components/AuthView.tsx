"use client";

import { AuthModalView, unwrapProfile, usePhoneAuth } from "@even/ui/diner";
import LanguageToggleButton from "@even/i18n/language-toggle-button";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/context/AuthContext";

interface AuthViewProps {
  onClose: () => void;
}

/**
 * Inicio de sesión dentro del modal de ajustes del menú. Las vistas y el estado (teléfono → código → perfil) viven
 * en `@even/ui/diner`; aquí solo se enlaza con el servicio de la app. Al terminar, el contexto pasa a autenticado y
 * el menú cambia al panel (no hay navegación).
 */
export default function AuthView({ onClose }: AuthViewProps) {
  const { verifyOTP, createOrUpdateProfile, refreshProfile, user, profile } = useAuth();

  const auth = usePhoneAuth({
    sendOtp: (phone) => authService.sendPhoneOTP(phone),
    verifyOtp: verifyOTP,
    // Tras verificar se consulta el perfil: con nombre se recarga el contexto; sin él, se pide en el modal.
    hasProfile: async () => {
      const response = await authService.getMyProfile();
      return response.success && !!unwrapProfile(response.data)?.firstName;
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

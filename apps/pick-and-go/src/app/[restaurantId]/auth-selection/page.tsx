"use client";

import { AuthStepCard, usePhoneAuth } from "@even/ui/diner";
import { useNavigation } from "@/hooks/useNavigation";
import { useAuthSelectionCopy } from "@/hooks/useAuthCopy";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/context/AuthContext";

/**
 * Acceso antes de confirmar el pedido (CartView manda aquí a quien no tiene sesión o tiene el perfil incompleto):
 * teléfono → código SMS → perfil. Las vistas y el estado viven en `@even/ui/diner`; aquí solo quedan el servicio
 * y las rutas de Pick & Go. Con sesión previa salta directo al perfil (si falta) o al pedido.
 */
export default function AuthSelectionPage() {
  const { navigateWithRestaurantId } = useNavigation();
  const { validationError } = useValidateAccess();
  const copy = useAuthSelectionCopy();
  const { verifyOTP, refreshProfile, updateProfile, profile, isAuthenticated, isLoading } = useAuth();

  const auth = usePhoneAuth({
    sendOtp: (phone) => authService.sendPhoneOTP(phone),
    verifyOtp: verifyOTP,
    saveProfile: (data) => updateProfile(data),
    refreshProfile,
    // verifyOTP resuelve el perfil antes de actualizar el contexto: este decide si pedir perfil o terminar.
    session: { isAuthenticated, isLoading, profile, skipIfComplete: true },
    // replace: un "atrás" posterior desde order-confirm salta al carrito sin pasar de nuevo por aquí.
    onAuthenticated: () => navigateWithRestaurantId("/order-confirm", { replace: true }),
  });

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <div className="min-h-new brand-evergreen flex flex-col">
      <MenuHeaderBack />
      <AuthStepCard variant="selection" auth={auth} copy={copy} />
    </div>
  );
}

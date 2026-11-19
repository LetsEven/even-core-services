"use client";

import { ArrowLeft, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { useModalBackClose } from "../../lib/use-modal-back-close";
import { AuthError, PhoneStepForm, ProfileStepForm, VerifyStepForm } from "./AuthSteps";
import { formatPhoneNumber } from "./phone";
import type { PhoneAuth } from "./usePhoneAuth";

export type AuthModalViewProps = {
  auth: PhoneAuth;
  /** Cierra el modal (flecha del paso del teléfono y botón atrás del dispositivo). */
  onClose: () => void;
  /** Hay sesión (usuario del contexto). Con sesión pero sin nombre pasa directo al perfil (p. ej. al recargar). */
  signedIn: boolean;
  /** El perfil del contexto ya tiene nombre. */
  hasName: boolean;
  /** Elemento a la derecha de la cabecera (selector de idioma). */
  headerEnd?: ReactNode;
};

/**
 * Inicio de sesión dentro del modal de ajustes (menú): cabecera con la flecha, logo, título por subpaso y los
 * formularios compartidos (`PhoneStepForm`, `VerifyStepForm`, `ProfileStepForm`). El estado viene de `usePhoneAuth`.
 * El botón atrás del dispositivo retrocede un subpaso en vez de cerrar el modal (`useModalBackClose`).
 */
export default function AuthModalView({ auth, onClose, signedIn, hasName, headerEnd }: AuthModalViewProps) {
  const t = useTranslations("Auth");
  const { step, loading, goToProfile, changeNumber } = auth;

  // Si ya hay sesión pero falta el nombre, a perfil — salvo durante una operación en curso: al iniciar sesión el
  // usuario se fija antes de que llegue el perfil y se vería "Completa tu perfil" un instante a quien ya lo tiene.
  useEffect(() => {
    if (signedIn && !hasName && !loading) goToProfile();
  }, [signedIn, hasName, loading, goToProfile]);

  const handleBack = (rearm?: () => void) => {
    if (step === "verify") {
      changeNumber();
      rearm?.();
    } else if (step === "profile") {
      // No se puede regresar: el usuario ya está autenticado.
      rearm?.();
    } else {
      onClose();
    }
  };

  // Una sola capa del stack compartido durante toda la vida del modal (no una entrada de historial por subpaso).
  useModalBackClose(true, handleBack);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between p-4 md:p-5 lg:p-6">
        <button
          type="button"
          onClick={() => handleBack()}
          disabled={step === "profile"}
          className={`rounded-full p-1 text-tone-400 transition-colors hover:text-tone-700 md:p-1.5 ${
            step === "profile" ? "cursor-not-allowed opacity-30" : "cursor-pointer"
          }`}
        >
          {step === "phone" ? (
            <ChevronDown className="size-6 md:size-7 lg:size-8" />
          ) : (
            <ArrowLeft className="size-6 md:size-7 lg:size-8" />
          )}
        </button>
        {headerEnd}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 md:px-8 lg:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- UI compartida, sin dependencia de next/image */}
            <img src="/even/even-asterisk-evergreen.svg" alt="Even" className="mx-auto mb-6 size-16 md:size-20" />
            <h1 className="text-2xl font-medium text-black/90">
              {step === "phone" ? t("phoneStepTitle") : step === "verify" ? t("verifyStepTitle") : t("profileStepTitle")}
            </h1>
            <p className="mt-2 text-sm text-tone-500 md:text-base">
              {step === "phone" ? (
                t("phoneStepSubtitle")
              ) : step === "verify" ? (
                <>
                  {t("verifyStepSubtitlePrefix")}
                  <br />
                  {formatPhoneNumber(auth.phone)}
                </>
              ) : (
                t("profileStepSubtitle")
              )}
            </p>
          </div>
          {auth.error && <AuthError>{auth.error}</AuthError>}
          {step === "phone" && (
            <PhoneStepForm
              countryCode={auth.countryCode}
              onCountryChange={auth.setCountryCode}
              phoneDisplay={auth.phoneDisplay}
              onPhoneChange={auth.changePhone}
              onSubmit={auth.sendCode}
              loading={auth.loading}
              canSubmit={auth.canSendCode}
              cta={auth.loading ? t("sending") : t("sendCode")}
              placeholder={t("phonePlaceholder")}
            />
          )}
          {step === "verify" && (
            <VerifyStepForm
              otp={auth.otp}
              onOtpChange={auth.setOtp}
              onSubmit={auth.verifyCode}
              onResend={auth.resendCode}
              onChangeNumber={auth.changeNumber}
              loading={auth.loading}
              sendingCode={auth.sendingCode}
              countdown={auth.countdown}
            />
          )}
          {step === "profile" && (
            <ProfileStepForm
              firstName={auth.firstName}
              onFirstNameChange={auth.setFirstName}
              lastName={auth.lastName}
              onLastNameChange={auth.setLastName}
              age={auth.age}
              onAgeChange={auth.setAge}
              acceptedTerms={auth.acceptedTerms}
              onAcceptedTermsChange={auth.setAcceptedTerms}
              onSubmit={auth.submitProfile}
              loading={auth.loading}
            />
          )}
        </div>
      </div>
    </div>
  );
}

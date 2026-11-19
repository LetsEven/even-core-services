"use client";

import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { StepHero } from "../../components/flow-skeletons";
import type { FlowScreen } from "../../components/flow-nav-overlay";
import { FlowStepCard } from "../FlowTransition";
import { AuthError, AuthIntro, PhoneStepForm, ProfileStepForm, VerifyStepForm, examplePhone, type GuestLink } from "./AuthSteps";
import { formatPhoneNumber } from "./phone";
import type { PhoneAuth } from "./usePhoneAuth";

/**
 * Las dos pantallas de inicio de sesión del flujo de comensal:
 * - `selection` (`auth-selection`): "¿Cómo deseas continuar?", con acceso por teléfono y, opcionalmente, "Continuar como invitado".
 * - `login` (`auth`): "Ingresa tu número", registro/ingreso desde el menú o tras pagar.
 */
export type AuthVariant = "selection" | "login";

/** Segmentos de ruta de cada pantalla; las apps los suman a sus `FLOW_STEPS`. */
export const AUTH_STEP_NAMES = { selection: "auth-selection", login: "auth" } as const satisfies Record<AuthVariant, string>;
export const AUTH_FLOW_STEPS = [AUTH_STEP_NAMES.selection, AUTH_STEP_NAMES.login] as const;

export type AuthCopyOverrides = {
  phoneTitle?: ReactNode;
  phoneSubtitle?: ReactNode;
  phoneCta?: ReactNode;
  profileTitle?: ReactNode;
};

export type AuthScreenOptions = {
  /** Muestra "Continuar como invitado" bajo el botón (solo `selection`). */
  guest?: boolean;
  /** Muestra el número de ejemplo bajo el campo. */
  example?: boolean;
  /** Textos propios de la app donde difieran de los compartidos (p. ej. Pick & Go). */
  copy?: AuthCopyOverrides;
};

/** Textos de cada paso: los compartidos de `@even/i18n` salvo lo que la app sobrescriba con `copy`. */
function useAuthCopy(variant: AuthVariant, copy?: AuthCopyOverrides) {
  const t = useTranslations("Auth");
  const selection = useTranslations("AuthSelectionPage");
  const login = useTranslations("AuthPage");
  const isSelection = variant === "selection";
  return {
    phoneTitle: copy?.phoneTitle ?? (isSelection ? selection("phoneStepTitle") : t("phoneStepTitle")),
    phoneSubtitle: copy?.phoneSubtitle ?? (isSelection ? selection("phoneStepSubtitle") : login("phoneStepSubtitle")),
    phoneCta: copy?.phoneCta ?? (isSelection ? selection("accessCta") : t("sendCode")),
    profileTitle: copy?.profileTitle ?? t("profileStepTitle"),
    verifyTitle: t("verifyStepTitle"),
    placeholder: t("phonePlaceholder"),
    examplePrefix: login("examplePrefix"),
  };
}

/**
 * Pantalla del paso para la transición: título y el paso del teléfono (el inicial) con los mismos componentes
 * que la vista real, así la tarjeta que sube mide lo mismo que la ya cargada. Se usa en el `screens` de cada app.
 */
export function useAuthScreen(variant: AuthVariant, { guest = false, example = false, copy }: AuthScreenOptions = {}): FlowScreen {
  const text = useAuthCopy(variant, copy);
  const t = useTranslations("Auth");
  return {
    hero: <StepHero title={text.phoneTitle} />,
    body: (
      <>
        <AuthIntro>{text.phoneSubtitle}</AuthIntro>
        <PhoneStepForm
          inert
          countryCode="+52"
          phoneDisplay=""
          cta={text.phoneCta}
          placeholder={text.placeholder}
          example={example ? `${text.examplePrefix} ${examplePhone("+52")}` : undefined}
          guest={guest ? { label: t("continueAsGuest"), onClick: () => {} } : undefined}
        />
      </>
    ),
    layout: "anchored",
    cardClassName: "flex-none py-8 md:py-10",
  };
}

export type AuthStepCardProps = {
  variant: AuthVariant;
  auth: PhoneAuth;
  guest?: GuestLink;
  example?: boolean;
  copy?: AuthCopyOverrides;
  /** La vista aún no puede mostrarse (validando acceso, cargando sesión): se queda el esqueleto de la transición. */
  loading?: boolean;
};

/**
 * Hoja del paso de inicio de sesión: título según el subpaso (teléfono → código → perfil) y su formulario dentro de
 * la tarjeta. La altura de la tarjeta se anima entre subpasos. Bloquea el scroll del body mientras está montada para
 * que iOS no deje la pantalla desplazada al cerrar el teclado.
 */
export default function AuthStepCard({ variant, auth, guest, example, copy, loading }: AuthStepCardProps) {
  const text = useAuthCopy(variant, copy);
  const t = useTranslations("Auth");
  const { step } = auth;

  useEffect(() => {
    const { style } = document.body;
    const previous = { overflow: style.overflow, position: style.position, width: style.width, height: style.height };
    Object.assign(style, { overflow: "hidden", position: "fixed", width: "100%", height: "100%" });
    return () => {
      Object.assign(style, previous);
    };
  }, []);

  const title = step === "phone" ? text.phoneTitle : step === "verify" ? text.verifyTitle : text.profileTitle;

  return (
    <FlowStepCard
      step={variant === "selection" ? AUTH_STEP_NAMES.selection : AUTH_STEP_NAMES.login}
      loading={loading}
      hero={<StepHero title={title} />}
      animateHeight
    >
      <AuthIntro>
        {step === "phone" ? (
          text.phoneSubtitle
        ) : step === "verify" ? (
          <>
            {t("verifyStepSubtitlePrefix")}
            <br />
            {formatPhoneNumber(auth.phone)}
          </>
        ) : (
          t("profileStepSubtitle")
        )}
      </AuthIntro>
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
          cta={auth.loading ? t("sending") : text.phoneCta}
          placeholder={text.placeholder}
          example={example ? `${text.examplePrefix} ${examplePhone(auth.countryCode)}` : undefined}
          guest={guest}
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
    </FlowStepCard>
  );
}

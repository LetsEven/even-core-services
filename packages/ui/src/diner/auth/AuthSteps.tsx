"use client";

import { ChevronDown, Phone, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Flag from "react-world-flags";
import { cn } from "../../lib/cn";
import { TermsCheckbox, termsLinks } from "../../components/terms-checkbox";
import { COUNTRIES, MAX_AGE, MIN_AGE, OTP_LENGTH } from "./phone";

/**
 * Formularios de cada paso del inicio de sesión por teléfono, para la tarjeta blanca del flujo
 * (`AuthStepCard`). Son presentacionales: el estado vive en `usePhoneAuth`. El paso del teléfono también lo pinta
 * el esqueleto de la transición (con valores vacíos), así la tarjeta mide lo mismo antes y después de cargar.
 */

const FIELD =
  "w-full rounded-xl border border-tone-300 bg-white text-tone-700 focus:ring-2 focus:ring-even-evergreen focus:outline-none";
const PRIMARY =
  "w-full rounded-full bg-even-grass py-3.5 font-medium text-even-evergreen transition-opacity hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:bg-even-grass/30 disabled:text-even-evergreen/40";
const LINK = "text-sm underline underline-offset-2 transition-colors";

/** Número de ejemplo bajo el campo (solo en la pantalla de inicio de sesión). */
export function examplePhone(countryCode: string) {
  return countryCode === "+52" || countryCode === "+1" ? "500 555 0006" : "123 456 789";
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mb-4 rounded-lg border border-danger-500 bg-danger-500/10 p-3 text-sm text-danger-700">
      {children}
    </div>
  );
}

/** Línea bajo el título de la tarjeta. */
export function AuthIntro({ children }: { children: ReactNode }) {
  return <p className="mb-6 text-center text-sm text-tone-600 md:text-base">{children}</p>;
}

export type GuestLink = { label: ReactNode; onClick: () => void; disabled?: boolean };

export type PhoneStepFormProps = {
  countryCode: string;
  onCountryChange?: (code: string) => void;
  phoneDisplay: string;
  onPhoneChange?: (value: string) => void;
  onSubmit?: (event: FormEvent) => void;
  loading?: boolean;
  canSubmit?: boolean;
  cta: ReactNode;
  placeholder: string;
  /** Texto "Ejemplo: 500 555 0006" bajo el campo. */
  example?: ReactNode;
  guest?: GuestLink;
  /** Esqueleto de la transición: mismo marcado, sin foco ni interacción. */
  inert?: boolean;
};

export function PhoneStepForm({
  countryCode,
  onCountryChange,
  phoneDisplay,
  onPhoneChange,
  onSubmit,
  loading,
  canSubmit,
  cta,
  placeholder,
  example,
  guest,
  inert,
}: PhoneStepFormProps) {
  const [open, setOpen] = useState(false);
  const country = COUNTRIES.find((item) => item.code === countryCode) ?? COUNTRIES[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".country-selector")) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-2">
          <div className="flex gap-3">
            <div className="country-selector relative">
              <button
                type="button"
                tabIndex={inert ? -1 : undefined}
                onClick={() => setOpen((value) => !value)}
                disabled={loading}
                aria-label={country.name}
                className={cn(FIELD, "flex h-13 w-22.5 cursor-pointer items-center justify-between gap-1.5 px-3 font-medium")}
              >
                <span className="flex items-center gap-1.5">
                  <Flag code={country.flag} style={{ width: 20, height: 15, borderRadius: 2 }} />
                  <span className="text-sm">{country.code}</span>
                </span>
                <ChevronDown className="size-3 shrink-0 text-tone-500" />
              </button>
              {open && (
                <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-tone-300 bg-white shadow-lg">
                  {COUNTRIES.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        onCountryChange?.(item.code);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-tone-100"
                    >
                      <Flag code={item.flag} style={{ width: 20, height: 15, borderRadius: 2 }} />
                      <span className="text-sm font-medium text-tone-700">{item.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative flex-1">
              <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tone-400" />
              <input
                required
                type="tel"
                value={phoneDisplay}
                onChange={(event) => onPhoneChange?.(event.target.value)}
                readOnly={inert}
                tabIndex={inert ? -1 : undefined}
                placeholder={placeholder}
                disabled={loading}
                maxLength={14}
                className={cn(FIELD, "h-13 pr-3 pl-10")}
              />
            </div>
          </div>
          {example != null && <p className="text-xs text-tone-500">{example}</p>}
        </div>
        <button type="submit" tabIndex={inert ? -1 : undefined} disabled={!canSubmit} className={PRIMARY}>
          {cta}
        </button>
      </form>
      {guest && (
        <div className="pt-1 text-center">
          <button
            type="button"
            tabIndex={inert ? -1 : undefined}
            onClick={guest.onClick}
            disabled={guest.disabled}
            className={cn(LINK, "text-tone-500 hover:text-tone-700 disabled:opacity-50")}
          >
            {guest.label}
          </button>
        </div>
      )}
    </div>
  );
}

export type VerifyStepFormProps = {
  otp: string;
  onOtpChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onResend: () => void;
  onChangeNumber: () => void;
  loading: boolean;
  sendingCode: boolean;
  countdown: number;
};

export function VerifyStepForm({
  otp,
  onOtpChange,
  onSubmit,
  onResend,
  onChangeNumber,
  loading,
  sendingCode,
  countdown,
}: VerifyStepFormProps) {
  const t = useTranslations("Auth");
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="text"
        inputMode="numeric"
        maxLength={OTP_LENGTH}
        value={otp}
        onChange={(event) => onOtpChange(event.target.value)}
        placeholder="000000"
        required
        disabled={loading}
        autoFocus
        autoComplete="one-time-code"
        aria-label={t("verifyStepTitle")}
        className={cn(FIELD, "px-3 py-3 text-center text-2xl tracking-widest")}
      />
      <button type="submit" disabled={loading || sendingCode || otp.length !== OTP_LENGTH} className={PRIMARY}>
        {sendingCode ? t("sending") : loading ? t("verifying") : t("verifyCode")}
      </button>
      <div className="text-center">
        <button
          type="button"
          onClick={onResend}
          disabled={countdown > 0 || loading || sendingCode}
          className={cn(LINK, countdown > 0 ? "cursor-not-allowed text-tone-400" : "cursor-pointer text-tone-600 hover:text-tone-800")}
        >
          {countdown > 0 ? t("resendIn", { seconds: countdown }) : t("resendCta")}
        </button>
      </div>
      <div className="text-center">
        <button type="button" onClick={onChangeNumber} className={cn(LINK, "text-tone-600 hover:text-tone-800")}>
          {t("changeNumber")}
        </button>
      </div>
    </form>
  );
}

export type ProfileStepFormProps = {
  firstName: string;
  onFirstNameChange: (value: string) => void;
  lastName: string;
  onLastNameChange: (value: string) => void;
  age: number | "";
  onAgeChange: (value: number | "") => void;
  acceptedTerms: boolean;
  onAcceptedTermsChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
  loading: boolean;
};

export function ProfileStepForm({
  firstName,
  onFirstNameChange,
  lastName,
  onLastNameChange,
  age,
  onAgeChange,
  acceptedTerms,
  onAcceptedTermsChange,
  onSubmit,
  loading,
}: ProfileStepFormProps) {
  const t = useTranslations("Auth");
  const terms = useTranslations("Terms");
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tone-400" />
          <input
            type="text"
            value={firstName}
            onChange={(event) => onFirstNameChange(event.target.value)}
            placeholder={t("firstNamePlaceholder")}
            required
            disabled={loading}
            className={cn(FIELD, "h-12 appearance-none rounded-lg pr-3 pl-10")}
          />
        </div>
        <input
          type="text"
          value={lastName}
          onChange={(event) => onLastNameChange(event.target.value)}
          placeholder={t("lastNamePlaceholder")}
          disabled={loading}
          className={cn(FIELD, "h-12 appearance-none rounded-lg px-3")}
        />
      </div>
      <div>
        <label htmlFor="auth-age" className="mb-1 block text-sm font-medium text-black">
          {t("ageLabel")}
        </label>
        <select
          id="auth-age"
          required
          value={age}
          onChange={(event) => onAgeChange(event.target.value === "" ? "" : Number(event.target.value))}
          disabled={loading}
          className={cn(FIELD, "h-12 cursor-pointer appearance-none rounded-lg px-3")}
        >
          <option value="" disabled>
            {t("selectAge")}
          </option>
          {Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, index) => index + MIN_AGE).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <TermsCheckbox
        checked={acceptedTerms}
        onChange={onAcceptedTermsChange}
        disabled={loading}
        variant="light"
        label={(linkClass) => terms.rich("checkbox", termsLinks(linkClass))}
      />
      <button type="submit" disabled={loading || !firstName || age === "" || !acceptedTerms} className={cn(PRIMARY, "mt-6 py-3")}>
        {loading ? t("saving") : t("continueCta")}
      </button>
    </form>
  );
}

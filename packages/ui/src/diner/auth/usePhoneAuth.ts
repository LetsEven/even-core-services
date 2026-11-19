"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  DEFAULT_COUNTRY_CODE,
  MIN_PHONE_DIGITS,
  OTP_LENGTH,
  RESEND_SECONDS,
  birthDateFromAge,
  formatPhoneInput,
} from "./phone";

export type AuthResult = { success: boolean; error?: string | null };
export type PhoneAuthStep = "phone" | "verify" | "profile";

export type ProfileFields = {
  firstName: string;
  lastName: string;
  birthDate: string;
  acceptedTerms: true;
};

export type PhoneAuthOptions = {
  /** Pide el SMS con el código. */
  sendOtp: (phone: string) => Promise<AuthResult>;
  /** Verifica el código y deja la sesión iniciada (normalmente `useAuth().verifyOTP`). */
  verifyOtp: (phone: string, code: string) => Promise<AuthResult>;
  /** Guarda el perfil (normalmente `useAuth().createOrUpdateProfile`). */
  saveProfile: (profile: ProfileFields) => Promise<AuthResult>;
  /** Recarga el perfil en el contexto de la app tras guardarlo. */
  refreshProfile?: () => Promise<unknown>;
  /**
   * Tras verificar el código: `true` = ya tiene perfil completo (se llama `onAuthenticated`), `false` = pedir el perfil.
   * Si se omite, el hook no decide: la app lo hace al reaccionar al contexto (`goToProfile` / `onAuthenticated`).
   */
  hasProfile?: () => Promise<boolean>;
  /** El usuario terminó de iniciar sesión (código verificado y perfil completo). La app navega o cierra. */
  onAuthenticated: () => void;
};

/**
 * Estado del inicio de sesión por teléfono: número → código SMS → perfil. Es la lógica que antes se copiaba en
 * `auth` y `auth-selection` de cada app; la app aporta solo el servicio (`sendOtp`, `verifyOtp`, `saveProfile`)
 * y qué hacer al terminar (`onAuthenticated`). Los pasos son estado del componente, no historial: el botón
 * atrás sale de la pantalla y "Cambiar número" vuelve al paso del teléfono.
 */
export function usePhoneAuth(options: PhoneAuthOptions) {
  const t = useTranslations("Auth");
  // Las opciones se leen desde un ref: los handlers no cambian de identidad aunque la app pase funciones nuevas.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [step, setStep] = useState<PhoneAuthStep>("phone");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  // Envío del SMS en curso: el paso del código se muestra de inmediato.
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const changePhone = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, "");
    setPhoneNumber(digits);
    setPhoneDisplay(formatPhoneInput(digits));
  }, []);

  const sendCode = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      setError("");
      setSendingCode(true);
      try {
        const fullPhone = countryCode + phoneNumber;
        setPhone(fullPhone);
        setStep("verify");
        const response = await optionsRef.current.sendOtp(fullPhone);
        if (response.success) {
          setCountdown(RESEND_SECONDS);
        } else {
          setStep("phone");
          setError(response.error || t("errorSendCode"));
        }
      } catch {
        setStep("phone");
        setError(t("errorSendCodeGeneric"));
      } finally {
        setSendingCode(false);
      }
    },
    [countryCode, phoneNumber, t],
  );

  const goToProfile = useCallback((prefill?: { firstName?: string; lastName?: string; age?: number | "" }) => {
    if (prefill) {
      setFirstName(prefill.firstName ?? "");
      setLastName(prefill.lastName ?? "");
      setAge(prefill.age ?? "");
    }
    setError("");
    setStep("profile");
  }, []);

  const verifyCode = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      setError("");
      if (otp.length !== OTP_LENGTH) {
        setError(t("errorInvalidCodeLength"));
        return;
      }
      setLoading(true);
      try {
        const { verifyOtp, hasProfile, refreshProfile, onAuthenticated } = optionsRef.current;
        const response = await verifyOtp(phone, otp);
        if (!response.success) {
          setError(response.error || t("errorInvalidCode"));
          return;
        }
        if (!hasProfile) return;
        if (await hasProfile().catch(() => false)) {
          await refreshProfile?.();
          onAuthenticated();
        } else {
          setStep("profile");
        }
      } catch {
        setError(t("errorVerifyCode"));
      } finally {
        setLoading(false);
      }
    },
    [otp, phone, t],
  );

  const resendCode = useCallback(async () => {
    if (countdown > 0) return;
    setError("");
    setLoading(true);
    try {
      const response = await optionsRef.current.sendOtp(phone);
      if (response.success) setCountdown(RESEND_SECONDS);
      else setError(response.error || t("errorResendCode"));
    } catch {
      setError(t("errorResendCode"));
    } finally {
      setLoading(false);
    }
  }, [countdown, phone, t]);

  const submitProfile = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (age === "" || !acceptedTerms) return;
      setError("");
      setLoading(true);
      try {
        const { saveProfile, refreshProfile, onAuthenticated } = optionsRef.current;
        const response = await saveProfile({
          firstName,
          lastName,
          birthDate: birthDateFromAge(Number(age)),
          acceptedTerms: true,
        });
        if (response.success) {
          await refreshProfile?.();
          onAuthenticated();
        } else {
          setError(response.error || t("errorSaveProfile"));
        }
      } catch {
        setError(t("errorSaveProfile"));
      } finally {
        setLoading(false);
      }
    },
    [acceptedTerms, age, firstName, lastName, t],
  );

  /** "Cambiar número": vuelve al paso del teléfono sin salir de la pantalla. */
  const changeNumber = useCallback(() => {
    setStep("phone");
    setOtp("");
    setError("");
  }, []);

  return {
    step,
    phone,
    countryCode,
    setCountryCode,
    phoneNumber,
    phoneDisplay,
    changePhone,
    otp,
    setOtp: (value: string) => setOtp(value.replace(/\D/g, "").slice(0, OTP_LENGTH)),
    firstName,
    setFirstName,
    lastName,
    setLastName,
    age,
    setAge,
    acceptedTerms,
    setAcceptedTerms,
    loading,
    sendingCode,
    error,
    countdown,
    canSendCode: !loading && phoneNumber.length >= MIN_PHONE_DIGITS,
    sendCode,
    verifyCode,
    resendCode,
    submitProfile,
    changeNumber,
    goToProfile,
  };
}

export type PhoneAuth = ReturnType<typeof usePhoneAuth>;

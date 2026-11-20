"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Phone, User, ChevronDown, ArrowLeft } from "lucide-react";
import Flag from "react-world-flags";
import { useTranslations } from "next-intl";
import { useNavigation } from "@/hooks/useNavigation";
import {
  COUNTRIES,
  formatPhoneNumber,
  usePhoneAuth,
} from "@even/ui/diner";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import ValidationError from "@/components/ValidationError";
import { authService } from "@/services/auth.service";
import { useAuth } from "@/context/AuthContext";
import TermsCheckbox from "@/components/TermsCheckbox";

const countries = COUNTRIES;

export default function AuthSelectionPage() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const { navigateWithRestaurantId } = useNavigation();
  const { validationError } = useValidateAccess();
  const {
    verifyOTP,
    refreshProfile,
    updateProfile,
    profile,
    isAuthenticated,
    isLoading: isAuthLoading,
  } = useAuth();

  const auth = usePhoneAuth({
    sendOtp: (fullPhone) => authService.sendPhoneOTP(fullPhone),
    verifyOtp: verifyOTP,
    saveProfile: updateProfile,
    refreshProfile,
    // Si ya hay una sesión activa, no tiene sentido pedir teléfono/OTP de nuevo: salta al step de perfil (si falta
    // el nombre o la fecha de nacimiento) o a order-confirm. Tras verificar el código decide el contexto
    // (ver AuthContext.verifyOTP, que resuelve el perfil antes de actualizar el estado).
    session: {
      isAuthenticated,
      isLoading: isAuthLoading,
      profile,
      skipIfComplete: true,
    },
    onAuthenticated: () => navigateWithRestaurantId("/order-confirm", { replace: true }),
  });
  const {
    step,
    phone,
    countryCode,
    setCountryCode,
    phoneNumber,
    phoneDisplay: phoneNumberDisplay,
    otp,
    setOtp,
    firstName: newFirstName,
    setFirstName: setNewFirstName,
    lastName: newLastName,
    setLastName: setNewLastName,
    age: newAge,
    setAge: setNewAge,
    acceptedTerms,
    setAcceptedTerms,
    loading,
    sendingCode,
    error,
    countdown,
    changeNumber,
  } = auth;
  const handleSendOTP = auth.sendCode;
  const handleVerifyOTP = auth.verifyCode;
  const handleResendOTP = auth.resendCode;
  const handleSaveProfile = auth.submitProfile;
  const selectedCountry =
    countries.find((c) => c.code === countryCode) ?? countries[0];

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Toda la página usa UNA sola entrada de historial "guardia" (en vez de
  // una por step). Los cambios de step hacia adelante (phone->verify->
  // profile) son puro estado de React, no tocan el historial. El gesto/
  // botón atrás dispara `popstate`, que consume esa entrada: si hay un
  // step anterior al que volver, la re-empujamos (se "absorbe" el back
  // como un cambio de step); si no, se deja salir de verdad hacia /cart.
  // Al completar el login con éxito, esa única entrada se reemplaza por
  // order-confirm (ver handleVerifyOTP/handleSaveProfile), así que un
  // "atrás" posterior desde order-confirm salta directo a cart sin pasar
  // de nuevo por esta pantalla.
  useEffect(() => {
    window.history.replaceState({ evenAuthGuard: true }, "");
  }, []);

  // Consume la entrada guardia para que sea `popstate` quien decida si hay
  // que volver un step o salir de verdad de la página.
  const goToPreviousStep = useCallback(() => {
    if (step === "profile") return; // no se puede retroceder, ya autenticado
    router.back();
  }, [step, router]);

  useEffect(() => {
    const handlePopState = () => {
      if (step === "profile") {
        // No se puede salir del step de perfil con el gesto/botón atrás.
        window.history.pushState({ evenAuthGuard: true }, "");
        return;
      }
      if (step === "verify") {
        // Absorbe el back como un paso atrás (verify -> phone), sin salir.
        changeNumber();
        window.history.pushState({ evenAuthGuard: true }, "");
        return;
      }
      // step === "phone": se deja salir de la página hacia la anterior.
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [step, changeNumber]);

  useEffect(() => {
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      width: document.body.style.width,
      height: document.body.style.height,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.width = prev.width;
      document.body.style.height = prev.height;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".country-selector")) setIsDropdownOpen(false);
    };
    if (isDropdownOpen)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <div className="h-screen overflow-hidden brand-evergreen flex flex-col">
      {/* Back Button */}
      <button
        onClick={goToPreviousStep}
        disabled={step === "profile"}
        className={`absolute top-4 md:top-6 lg:top-8 left-4 md:left-6 lg:left-8 p-2 md:p-3 text-white rounded-full transition-all active:bg-white/10 z-20 ${
          step === "profile"
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-white/10"
        }`}
      >
        <ArrowLeft className="size-5 md:size-6 lg:size-7" />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Title */}
          <div className="mb-8 text-center">
            <img
              src="/even/even-asterisk-grass.svg"
              alt="Even"
              className="size-16 md:size-20 lg:size-24 mx-auto mb-6"
            />
            <h1 className="text-2xl font-medium text-white">
              {step === "phone"
                ? t("phoneStepTitleAlt")
                : step === "verify"
                  ? t("verifyStepTitle")
                  : t("profileStepTitleAlt")}
            </h1>
            <p className="text-tone-200 mt-2">
              {step === "phone" ? (
                t("phoneStepSubtitle")
              ) : step === "verify" ? (
                <>
                  {t("verifyStepSubtitlePrefix")}
                  <br />
                  {formatPhoneNumber(phone)}
                </>
              ) : (
                t("profileStepSubtitle")
              )}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-danger-500/20 border border-danger-500 rounded-lg text-white text-sm">
              {error}
            </div>
          )}

          {/* Phone Step */}
          {step === "phone" && (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div className="space-y-2">
                <div className="flex gap-3">
                  {/* Country Code Selector */}
                  <div className="relative country-selector">
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen((o) => !o)}
                      className="h-[48px] w-[90px] px-3 text-tone-700 font-medium bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen focus:border-transparent cursor-pointer hover:border-tone-400 transition-colors flex items-center justify-between gap-1.5"
                      disabled={loading}
                    >
                      <div className="flex items-center gap-1.5">
                        <Flag
                          code={selectedCountry.flag}
                          style={{ width: 20, height: 15, borderRadius: 2 }}
                        />
                        <span className="text-sm">{selectedCountry.code}</span>
                      </div>
                      <ChevronDown className="size-3 text-tone-500 shrink-0" />
                    </button>

                    {isDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-full bg-white border border-tone-300 rounded-lg shadow-lg z-50 overflow-hidden">
                        {countries.map((country) => (
                          <button
                            key={country.code}
                            type="button"
                            onClick={() => {
                              setCountryCode(country.code);
                              setIsDropdownOpen(false);
                            }}
                            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-tone-100 transition-colors text-left"
                          >
                            <Flag
                              code={country.flag}
                              style={{ width: 20, height: 15, borderRadius: 2 }}
                            />
                            <span className="text-sm font-medium text-tone-700">
                              {country.code}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Phone Number Input */}
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-tone-400 pointer-events-none" />
                    <input
                      required
                      type="tel"
                      value={phoneNumberDisplay}
                      onChange={(e) => auth.changePhone(e.target.value)}
                      className="h-[48px] w-full pl-10 pr-3 text-tone-600 bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen focus:border-transparent"
                      placeholder={t("phonePlaceholder")}
                      disabled={loading}
                      maxLength={14}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !phoneNumber || phoneNumber.length < 8}
                className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed"
              >
                {loading ? t("sending") : t("sendCode")}
              </button>
            </form>
          )}

          {/* Profile Step */}
          {step === "profile" && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tone-400 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder={t("firstNamePlaceholder")}
                    className="h-[48px] w-full pl-10 pr-3 text-tone-600 bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen appearance-none"
                    disabled={loading}
                  />
                </div>
                <input
                  type="text"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder={t("lastNamePlaceholder")}
                  className="h-[48px] w-full px-3 text-tone-600 bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen appearance-none"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t("ageLabel")}
                </label>
                <select
                  required
                  value={newAge}
                  onChange={(e) =>
                    setNewAge(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  className="h-[48px] w-full px-3 text-tone-600 bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen cursor-pointer appearance-none"
                  disabled={loading}
                >
                  <option value="" disabled>
                    {t("selectAge")}
                  </option>
                  {Array.from({ length: 59 }, (_, i) => i + 12).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <TermsCheckbox
                checked={acceptedTerms}
                onChange={setAcceptedTerms}
                disabled={loading}
              />

              <button
                type="submit"
                disabled={loading || !newFirstName || newAge === "" || !acceptedTerms}
                className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed mt-6"
              >
                {loading ? t("saving") : t("continueCta")}
              </button>
            </form>
          )}

          {/* OTP Step */}
          {step === "verify" && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full px-3 py-3 text-tone-700 bg-white border border-tone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-even-evergreen text-center tracking-widest text-2xl"
                required
                disabled={loading}
                autoFocus
                autoComplete="one-time-code"
              />
              <button
                type="submit"
                disabled={loading || sendingCode || otp.length !== 6}
                className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3.5 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed active:scale-95"
              >
                {sendingCode
                  ? t("sending")
                  : loading
                    ? t("verifying")
                    : t("verifyCode")}
              </button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={countdown > 0 || loading || sendingCode}
                  className={`text-sm underline transition-colors ${
                    countdown > 0
                      ? "text-white/40 cursor-not-allowed"
                      : "text-white/80 hover:text-white cursor-pointer"
                  }`}
                >
                  {countdown > 0
                    ? t("resendIn", { seconds: countdown })
                    : t("resendCta")}
                </button>
              </div>
              <div className="text-center">
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  className="text-sm text-white/80 hover:text-white underline"
                >
                  {t("changeNumber")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

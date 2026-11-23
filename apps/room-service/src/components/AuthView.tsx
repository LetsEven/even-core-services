"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Phone, User, ChevronDown } from "lucide-react";
import Flag from "react-world-flags";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import TermsCheckbox from "@/components/TermsCheckbox";
import { useModalBackClose } from "@even/ui";
import { COUNTRIES, formatPhoneNumber, usePhoneAuth } from "@even/ui/diner";

const countries = COUNTRIES;

interface AuthViewProps {
  onClose: () => void;
}

export default function AuthView({ onClose }: AuthViewProps) {
  const t = useTranslations("Auth");
  const {
    sendOTP,
    verifyOTP,
    createOrUpdateProfile: updateProfile,
    refreshProfile,
    user,
    profile: authProfile,
  } = useAuth();

  const auth = usePhoneAuth({
    sendOtp: sendOTP,
    // Tras verificar el código se recarga el perfil; el efecto [user, authProfile] decide el siguiente paso
    // (con nombre el modal cambia a DashboardView; sin él, al paso del perfil).
    verifyOtp: async (fullPhone, code) => {
      const response = await verifyOTP(fullPhone, code);
      if (response.success) await refreshProfile();
      return response;
    },
    saveProfile: updateProfile,
    refreshProfile,
    onAuthenticated: () => undefined,
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
    changeNumber,
    goToProfile,
  } = auth;
  const handleSendOTP = auth.sendCode;
  const handleVerifyOTP = auth.verifyCode;
  const handleResendOTP = auth.resendCode;
  const handleProfileSubmit = auth.submitProfile;
  const selectedCountry =
    countries.find((c) => c.code === countryCode) ?? countries[0];

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".country-selector")) setIsDropdownOpen(false);
    };
    if (isDropdownOpen)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  // Si ya autenticado pero sin nombre, ir directo a perfil
  useEffect(() => {
    if (user && !authProfile?.firstName && !loading && step !== "profile") {
      goToProfile();
    }
  }, [user, authProfile, loading, step, goToProfile]);

  // Un solo handler para el click del botón y para el gesto/botón atrás
  // del dispositivo (vía useModalBackClose). `rearm` solo lo pasa el
  // hook cuando el back viene de un gesto/botón nativo: reabsorbe el
  // back como cambio de step (o como trampa en "profile") en vez de
  // dejar que cierre el modal completo.
  const handleBack = (rearm?: () => void) => {
    if (step === "verify") {
      changeNumber();
      rearm?.();
    } else if (step === "profile") {
      // no se puede regresar, usuario ya autenticado
      rearm?.();
    } else {
      onClose();
    }
  };

  // AuthView vive mientras el modal de settings está montado: se registra
  // como UNA sola capa del stack compartido durante toda su vida (no una
  // entrada de historial por step).
  useModalBackClose(true, handleBack);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 md:p-5 lg:p-6 flex items-center shrink-0">
        <button
          onClick={() => handleBack()}
          disabled={step === "profile"}
          className={`text-tone-400 hover:text-tone-700 rounded-full p-1 md:p-1.5 transition-colors ${
            step === "profile"
              ? "opacity-30 cursor-not-allowed"
              : "cursor-pointer"
          }`}
        >
          {step === "phone" ? (
            <ChevronDown className="size-6 md:size-7 lg:size-8" />
          ) : (
            <ArrowLeft className="size-6 md:size-7 lg:size-8" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 md:px-8 lg:px-10 pb-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 text-center">
            <img
              src="/even/even-asterisk-evergreen.svg"
              alt="Even"
              className="size-16 mx-auto mb-6"
            />
            <h1 className="text-2xl font-medium text-black/90">
              {step === "phone"
                ? t("phoneStepTitle")
                : step === "verify"
                  ? t("verifyStepTitle")
                  : t("profileStepTitle")}
            </h1>
            <p className="text-tone-500 mt-2 text-sm md:text-base">
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
            <div className="mb-4 p-3 bg-danger-500/10 border border-danger-400/50 rounded-lg text-danger-600 text-sm">
              {error}
            </div>
          )}

          {/* Phone Step */}
          {step === "phone" && (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div className="space-y-2">
                <div className="flex gap-3">
                  <div className="relative country-selector">
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen((o) => !o)}
                      className="h-12 w-22.5 px-3 text-tone-700 font-medium bg-white/70 border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen focus:border-transparent cursor-pointer hover:border-tone-400 transition-colors flex items-center justify-between gap-1.5"
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
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tone-400 pointer-events-none" />
                    <input
                      required
                      type="tel"
                      value={phoneNumberDisplay}
                      onChange={(e) => auth.changePhone(e.target.value)}
                      className="h-12 w-full pl-10 pr-3 text-tone-700 bg-white/70 border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen"
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
                className="w-full px-3 py-3 text-tone-700 bg-white/70 border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen text-center tracking-widest text-2xl"
                required
                disabled={loading}
                autoFocus
                autoComplete="one-time-code"
              />
              <button
                type="submit"
                disabled={loading || sendingCode || otp.length !== 6}
                className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed"
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
                      ? "text-tone-400 cursor-not-allowed"
                      : "text-tone-600 hover:text-black cursor-pointer"
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
                  onClick={() => handleBack()}
                  className="text-sm text-tone-600 hover:text-black underline"
                >
                  {t("changeNumber")}
                </button>
              </div>
            </form>
          )}

          {/* Profile Step */}
          {step === "profile" && (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tone-400 pointer-events-none" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t("firstNamePlaceholder")}
                    className="h-12 w-full pl-10 pr-3 text-tone-700 bg-white/70 border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen"
                    required
                    disabled={loading}
                  />
                </div>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder={t("lastNamePlaceholder")}
                  className="h-12 w-full px-3 text-tone-700 bg-white/70 border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black/70 mb-1">
                  {t("ageLabel")}
                </label>
                <select
                  required
                  value={age}
                  onChange={(e) =>
                    setAge(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="h-12 w-full px-3 text-tone-700 bg-white/70 border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-evergreen cursor-pointer"
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
                variant="light"
              />

              <button
                type="submit"
                disabled={loading || !firstName || age === "" || !acceptedTerms}
                className="w-full bg-even-grass text-even-evergreen hover:opacity-90 py-3 rounded-full font-medium transition-opacity disabled:bg-even-grass/30 disabled:text-even-evergreen/40 disabled:cursor-not-allowed mt-6"
              >
                {loading ? t("saving") : t("continueCta")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

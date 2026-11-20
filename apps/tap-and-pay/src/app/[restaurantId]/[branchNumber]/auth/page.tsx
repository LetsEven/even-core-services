"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Phone, User, ChevronDown } from "lucide-react";
import Flag from "react-world-flags";
import { useTranslations } from "next-intl";
import { authService } from "@/app/services/auth.service";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useAuth } from "@/app/context/AuthContext";
import TermsCheckbox from "@/app/components/TermsCheckbox";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import {
  COUNTRIES,
  formatPhoneNumber,
  unwrapProfile,
  usePhoneAuth,
} from "@even/ui/diner";
import { orderService } from "@/app/services/order.service";
import { useTable } from "@/app/context/TableContext";

const countries = COUNTRIES;

export default function AuthPage() {
  const t = useTranslations("Auth");
  const tp = useTranslations("AuthPage");
  const router = useRouter();
  const { navigateWithTable } = useTableNavigation();
  const params = useParams();
  const searchParams = useSearchParams();
  const {
    verifyOTP,
    createOrUpdateProfile: updateProfile,
    refreshProfile,
    user,
    profile,
  } = useAuth();
  const { state } = useTable();

  const restaurantId = params?.restaurantId as string;
  const branchNumber = params?.branchNumber as string;
  const tableNumber = searchParams.get("table");

  const auth = usePhoneAuth({
    sendOtp: (fullPhone) => authService.sendPhoneOTP(fullPhone),
    verifyOtp: verifyOTP,
    saveProfile: updateProfile,
    refreshProfile,
    // Tras verificar el código se pide el perfil aparte: con nombre sigue el flujo, sin él pide el perfil.
    hasProfile: async () => {
      const profileResponse = await authService.getMyProfile();
      if (!profileResponse.success || !profileResponse.data) return false;
      const found = unwrapProfile(profileResponse.data);
      return { firstName: found?.firstName, lastName: found?.lastName };
    },
    onAuthenticated: () => handleAuthRedirect(),
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
  } = auth;
  const handleSendOTP = auth.sendCode;
  const handleVerifyOTP = auth.verifyCode;
  const handleResendOTP = auth.resendCode;
  const handleProfileSubmit = auth.submitProfile;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const authCompletedRef = useRef(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".country-selector")) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Limpia los flags de sessionStorage que dirigen el redirect post-auth,
  // salvo que el login ya se haya completado con éxito (ahí los consume
  // handleAuthRedirect en vez de esta limpieza).
  const cleanupAuthFlags = useCallback(() => {
    if (authCompletedRef.current) return;
    sessionStorage.removeItem("authFromPaymentFlow");
    sessionStorage.removeItem("authFromMenu");
    sessionStorage.removeItem("even-post-auth-redirect");
    sessionStorage.removeItem("pendingTableRedirect");
    sessionStorage.removeItem("pendingRestaurantId");
  }, []);

  // Toda la página usa UNA sola entrada de historial "guardia" (en vez de
  // una por step). Los cambios de step hacia adelante (phone->verify->
  // profile) son puro estado de React, no tocan el historial. El gesto/
  // botón atrás dispara `popstate`, que consume esa entrada: si hay un
  // step anterior al que volver, la re-empujamos (se "absorbe" el back
  // como un cambio de step); si no, se limpian los flags de sessionStorage
  // y se deja salir de verdad de la página. Al completar el login con
  // éxito, esa única entrada se reemplaza por el destino final (ver
  // handleAuthRedirect), así que un "atrás" posterior no vuelve a pasar
  // por esta pantalla.
  useEffect(() => {
    window.history.replaceState({ evenAuth: true }, "");
  }, []);

  // Consume la entrada guardia para que sea `popstate` quien decida si hay
  // que volver un step o salir de verdad de la página.
  const goToPreviousStep = useCallback(() => {
    if (step === "profile") return; // no se puede retroceder, ya verificado
    router.back();
  }, [step, router]);

  useEffect(() => {
    const handlePopState = () => {
      if (step === "profile") {
        // No se puede salir del step de perfil con el gesto/botón atrás.
        window.history.pushState({ evenAuth: true }, "");
        return;
      }
      if (step === "verify") {
        // Absorbe el back como un paso atrás (verify -> phone), sin salir.
        changeNumber();
        window.history.pushState({ evenAuth: true }, "");
        return;
      }
      // step === "phone": salida real de la página, limpiar flags.
      cleanupAuthFlags();
    };

    window.addEventListener("popstate", handlePopState);
    // Limpieza también si se cierra/recarga la pestaña sin completar el login.
    window.addEventListener("beforeunload", cleanupAuthFlags);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", cleanupAuthFlags);
    };
  }, [step, cleanupAuthFlags, changeNumber]);

  // Helper function to handle post-auth redirects
  const handleAuthRedirect = () => {
    // Mark auth as completed so cleanup doesn't remove session items
    authCompletedRef.current = true;

    const postAuthRedirect = sessionStorage.getItem("even-post-auth-redirect");

    if (postAuthRedirect) {
      sessionStorage.removeItem("even-post-auth-redirect");
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("authFromMenu");
      // Navigate directly to the saved URL — replace so this page's guard
      // entry doesn't stay in history.
      router.replace(postAuthRedirect);
      return;
    }

    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    // Clear all session flags
    sessionStorage.removeItem("pendingTableRedirect");
    sessionStorage.removeItem("pendingRestaurantId");
    sessionStorage.removeItem("authFromPaymentFlow");
    sessionStorage.removeItem("authFromMenu");
    sessionStorage.removeItem("even-post-auth-redirect");

    if (authFromMenu && tableNumber) {
      // User signed in from MenuView settings, redirect to dashboard
      navigateWithTable("/dashboard", true);
    } else if (authFromPaymentFlow && tableNumber) {
      // User signed up during payment flow, redirect to payment-options
      navigateWithTable("/card-selection", true);
    } else {
      // Default redirect to menu
      navigateWithTable("/menu", true);
    }
  };

  return (
    <div className="min-h-new bg-even-evergreen flex flex-col justify-center items-center px-4">
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

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <img
            src="/even/even-asterisk-grass.svg"
            alt="Even"
            className="size-18 mx-auto mb-4"
          />
          <h1 className="text-2xl font-medium text-white">
            {step === "phone"
              ? t("phoneStepTitle")
              : step === "verify"
                ? t("verifyStepTitle")
                : t("profileStepTitle")}
          </h1>
          <p className="text-tone-200 mt-2">
            {step === "phone"
              ? tp("phoneStepSubtitle")
              : step === "verify"
                ? `${t("verifyStepSubtitlePrefix")} ${formatPhoneNumber(phone)}`
                : t("profileStepSubtitle")}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-danger-500/20 border border-danger-500 rounded-lg text-white text-sm">
            {error}
          </div>
        )}

        {/* Phone Input Step */}
        {step === "phone" && (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div className="space-y-2">
              <div className="flex gap-3">
                {/* Country Code Selector */}
                <div className="relative country-selector">
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="h-12 w-22.5 px-3 text-tone-700 font-medium bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-grass focus:border-transparent cursor-pointer hover:border-tone-400 transition-colors flex items-center justify-between gap-1.5"
                    disabled={loading}
                  >
                    <div className="flex items-center gap-1.5">
                      <Flag
                        code={
                          countries.find((c) => c.code === countryCode)?.flag ||
                          "MX"
                        }
                        style={{ width: 20, height: 15, borderRadius: 2 }}
                      />
                      <span className="text-sm">{countryCode}</span>
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
                    className="h-12 w-full pl-10 pr-3 text-tone-600 bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-grass focus:border-transparent"
                    placeholder={t("phonePlaceholder")}
                    disabled={loading}
                    maxLength={14}
                  />
                </div>
              </div>
              <p className="text-tone-300 text-xs">
                {tp("phoneExamplePrefix")}{" "}
                {countryCode === "+52"
                  ? "500 555 0006"
                  : countryCode === "+1"
                    ? "500 555 0006"
                    : "123 456 789"}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !phoneNumber || phoneNumber.length < 8}
              className="w-full bg-black hover:bg-warm-950 text-white py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t("sending") : t("sendCode")}
            </button>
          </form>
        )}

        {/* OTP Verification Step */}
        {step === "verify" && (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full px-3 py-3 text-tone-600 bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-grass text-center tracking-widest text-2xl"
              required
              disabled={loading}
              autoFocus
              autoComplete="one-time-code"
            />

            <button
              type="submit"
              disabled={loading || sendingCode || otp.length !== 6}
              className="w-full bg-black hover:bg-warm-950 text-white py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingCode
                  ? t("sending")
                  : loading
                    ? t("verifying")
                    : t("verifyCode")}
            </button>

            {/* Resend Button */}
            <div className="text-center">
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={countdown > 0 || loading || sendingCode}
                className={`text-sm underline transition-colors ${
                  countdown > 0
                    ? "text-tone-400 cursor-not-allowed"
                    : "text-white hover:text-tone-200 cursor-pointer"
                }`}
              >
                {countdown > 0
                  ? t("resendIn", { seconds: countdown })
                  : t("resendCta")}
              </button>
            </div>

            {/* Change Number */}
            <div className="text-center">
              <button
                type="button"
                onClick={goToPreviousStep}
                className="text-sm text-white hover:text-tone-200 underline"
              >
                {t("changeNumber")}
              </button>
            </div>
          </form>
        )}

        {/* Profile Completion Step */}
        {step === "profile" && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-tone-400 pointer-events-none" />
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t("firstNamePlaceholder")}
                  className="h-12 w-full pl-10 pr-3 text-tone-600 bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-grass appearance-none"
                  required
                  disabled={loading}
                />
              </div>

              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("lastNamePlaceholder")}
                className="h-12 w-full px-3 text-tone-600 bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-grass appearance-none"
                disabled={loading}
              />
            </div>

            {/* Age */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                {t("ageLabel")}
              </label>
              <select
                required
                value={age}
                onChange={(e) =>
                  setAge(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="h-12 w-full px-3 text-tone-600 bg-white border border-tone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-even-grass cursor-pointer appearance-none"
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !firstName || age === "" || !acceptedTerms}
              className="w-full bg-black hover:bg-warm-950 text-white py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? t("saving") : t("continueCta")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

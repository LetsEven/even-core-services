"use client";

import { FlowStepCard } from "@even/ui/diner";
import { DEFAULT_TIP_PERCENTAGE, readCheckoutDraft, writeCheckoutDraft } from "@even/cart";
import { useCheckoutPrefetch } from "@/hooks/useCheckoutPrefetch";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCart } from "@/context/CartContext";
import { useRoomNavigation } from "@/hooks/useRoomNavigation";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import { useEffect, useState } from "react";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { X } from "lucide-react";
import ValidationError from "@/components/ValidationError";
import { calculateCommissions } from "@/utils/commissionCalculator";

export default function OrderConfirmPage() {
  const t = useTranslations("OrderConfirmPage");
  const tc = useTranslations("Common");
  const { validationError } = useValidateAccess();
  const params = useParams();
  const { state: cartState } = useCart();
  const { navigateWithRoom } = useRoomNavigation();

  const baseAmount = cartState.totalPrice;
  const MINIMUM_AMOUNT = 20;

  // La propina elegida se conserva al ir a "pago" y volver.
  const draftScope = `${params?.restaurantId}/${params?.branchNumber}`;
  const [initialDraft] = useState(() => readCheckoutDraft(draftScope));
  const [tipPercentage, setTipPercentage] = useState(
    initialDraft?.tipPercentage ?? DEFAULT_TIP_PERCENTAGE,
  );
  const [customTip, setCustomTip] = useState(initialDraft?.customTip ?? "");
  const [showCustomTipInput, setShowCustomTipInput] = useState(
    initialDraft?.showCustomTipInput ?? false,
  );
  // El carrito vive en el provider: si ya cargó no hay nada que esperar y la
  // tarjeta se pinta completa desde el primer render.
  const [isLoadingInitial, setIsLoadingInitial] = useState(
    !cartState.hasLoaded || cartState.isLoading,
  );

  useEffect(() => {
    writeCheckoutDraft({ scope: draftScope, tipPercentage, customTip, showCustomTipInput });
  }, [draftScope, tipPercentage, customTip, showCustomTipInput]);

  // Ya en la confirmación se calienta el siguiente paso (pago).
  useCheckoutPrefetch(["card-selection"]);

  const calculateTipAmount = () => {
    if (customTip && parseFloat(customTip) > 0) return parseFloat(customTip);
    return (baseAmount * tipPercentage) / 100;
  };

  const tipAmount = calculateTipAmount();
  const commissions = calculateCommissions(baseAmount, tipAmount);
  const { totalAmountCharged: totalAmount } = commissions;

  const isUnderMinimum = totalAmount < MINIMUM_AMOUNT;

  useEffect(() => {
    if (!cartState.isLoading) {
      setIsLoadingInitial(false);
    }
  }, [cartState.isLoading]);

  // Red de seguridad: si se llega acá con el carrito vacío (link viejo,
  // navegación stale, etc.) no hay nada que confirmar, así que se manda
  // al usuario de vuelta al menú. hasLoaded evita rebotar por un carrito que
  // todavía no se ha resuelto contra el backend: al montar esta página el
  // estado arranca vacío y este efecto corre ANTES que el del CartProvider.
  useEffect(() => {
    if (
      cartState.hasLoaded &&
      !cartState.isLoading &&
      cartState.items.length === 0
    ) {
      navigateWithRoom("/menu", true);
    }
  }, [
    cartState.hasLoaded,
    cartState.isLoading,
    cartState.items.length,
    navigateWithRoom,
  ]);

  const handleTipPercentage = (percentage: number) => {
    setTipPercentage(percentage);
    setCustomTip("");
  };

  const handleCustomTipChange = (value: string) => {
    setCustomTip(value);
    setTipPercentage(0);
  };

  const handleContinue = () => {
    navigateWithRoom(`/card-selection?tipAmount=${tipAmount.toFixed(2)}`);
  };

  // Aún sin los datos de la cuenta: el esqueleto del paso y la transición espera.
  if (isLoadingInitial) {
    return (
      <div className="min-h-dvh brand-evergreen flex flex-col app-root">
        <MenuHeaderBack />
        <FlowStepCard step="order-confirm" loading>
          {null}
        </FlowStepCard>
      </div>
    );
  }

  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col app-root">
      <MenuHeaderBack />

      {/* Tarjeta anclada al fondo */}
      <FlowStepCard step="order-confirm">
            {/* Subtotal */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                  {tc("subtotal")}
                </span>
                <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                  ${baseAmount.toFixed(2)} MXN
                </span>
              </div>
            </div>

            {/* Propina */}
            <div className="mb-4">
              <div className="flex items-center gap-4 mb-3">
                <span className="text-black font-medium text-base md:text-lg lg:text-xl whitespace-nowrap">
                  {tc("tip")}
                </span>
                <div className="grid grid-cols-5 gap-2 flex-1">
                  {[0, 10, 15, 20].map((percentage) => (
                    <button
                      key={percentage}
                      onClick={() => {
                        handleTipPercentage(percentage);
                        setShowCustomTipInput(false);
                      }}
                      className={`py-1 md:py-1.5 rounded-full border border-stroke/40 text-black transition-colors cursor-pointer ${
                        tipPercentage === percentage && !showCustomTipInput
                          ? "bg-even-grass text-even-evergreen"
                          : "bg-surface hover:border-tone-400"
                      }`}
                    >
                      {percentage === 0 ? "0%" : `${percentage}%`}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setShowCustomTipInput(true);
                      setTipPercentage(0);
                    }}
                    className={`py-1 md:py-1.5 rounded-full border border-stroke/40 text-black transition-colors cursor-pointer ${
                      showCustomTipInput
                        ? "bg-even-grass text-even-evergreen"
                        : "bg-surface hover:border-tone-400"
                    }`}
                  >
                    $
                  </button>
                </div>
              </div>

              {showCustomTipInput && (
                <div className="flex flex-col gap-2 mb-3">
                  <div className="relative w-full">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      value={customTip}
                      onChange={(e) => handleCustomTipChange(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      autoFocus
                      className="w-full pl-8 pr-4 py-1 md:py-1.5 border border-stroke/40 rounded-full focus:outline-none focus:ring focus:ring-tone-400 text-black text-center bg-surface [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                    />
                  </div>
                </div>
              )}

              {tipAmount > 0 && (
                <div className="flex justify-end items-center mt-2 text-sm">
                  <span className="text-even-grass font-medium">
                    +${tipAmount.toFixed(2)} MXN
                  </span>
                </div>
              )}
            </div>

            {/* Alerta mínimo */}
            {isUnderMinimum && totalAmount > 0 && (
              <div className="bg-linear-to-br from-danger-50 to-danger-100 px-6 py-3 -mx-8 rounded-lg mb-4">
                <div className="flex justify-center items-center gap-3">
                  <X className="size-6 text-danger-500 shrink-0" />
                  <p className="text-danger-700 font-medium text-base md:text-lg">
                    {t("minimumAmountWarning", {
                      amount: MINIMUM_AMOUNT.toFixed(2),
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between items-center border-t pt-4 mb-6">
              <span className="text-black font-medium text-base md:text-lg lg:text-xl">
                {tc("totalToPay")}
              </span>
              <span className="font-medium text-black text-base md:text-lg lg:text-xl">
                ${totalAmount.toFixed(2)} MXN
              </span>
            </div>

            {/* Botón continuar */}
            <button
              onClick={handleContinue}
              disabled={isUnderMinimum}
              className={`w-full bg-even-grass text-even-evergreen py-3 rounded-full cursor-pointer transition-all active:scale-90 ${
                isUnderMinimum
                  ? "opacity-50 cursor-not-allowed"
                  : "animate-pulse-button"
              }`}
            >
              {t("continueCta")}
            </button>
      </FlowStepCard>
    </div>
  );
}

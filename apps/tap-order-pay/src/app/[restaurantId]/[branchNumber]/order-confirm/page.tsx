"use client";

import { PayButton, TipPicker, formatMoney } from "@even/ui";
import { FlowStepCard, useFlowAmount } from "@even/ui/diner";
import { DEFAULT_TIP_PERCENTAGE, readCheckoutDraft, writeCheckoutDraft } from "@even/cart";
import { useCheckoutPrefetch } from "@/hooks/useCheckoutPrefetch";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCart } from "@/context/CartContext";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import { useEffect, useMemo, useState } from "react";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { X } from "lucide-react";
import ValidationError from "@/components/ValidationError";
import { calculateCommissions } from "@/utils/commissionCalculator";
import { computeTipAmount, MINIMUM_AMOUNT, TIP_PRESETS } from "@even/payments";

export default function OrderConfirmPage() {
  const t = useTranslations("OrderConfirmPage");
  const tc = useTranslations("Common");
  const { validationError } = useValidateAccess();
  const params = useParams();
  const { state: cartState } = useCart();
  const { navigateWithTable } = useTableNavigation();

  const baseAmount = cartState.totalPrice;

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

  const tipAmount = useMemo(() => {
    if (customTip && parseFloat(customTip) > 0) return parseFloat(customTip);
    return computeTipAmount(baseAmount, tipPercentage);
  }, [customTip, baseAmount, tipPercentage]);

  const commissions = useMemo(
    () => calculateCommissions(baseAmount, tipAmount),
    [baseAmount, tipAmount],
  );

  const { totalAmountCharged: totalAmount } = commissions;

  const isUnderMinimum = totalAmount < MINIMUM_AMOUNT;

  // El hero lee este mismo `totalAmount`: es el que cobra el botón de pagar.
  useFlowAmount(
    isLoadingInitial
      ? null
      : {
          total: totalAmount,
          bill: baseAmount,
          tip: tipAmount,
          commission: commissions.evenClientCharge,
        },
  );

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
      navigateWithTable("/menu", true);
    }
  }, [
    cartState.hasLoaded,
    cartState.isLoading,
    cartState.items.length,
    navigateWithTable,
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
    navigateWithTable(`/card-selection?tipAmount=${tipAmount.toFixed(2)}`);
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
            {/* Propina (el total vive en el hero) */}
            <TipPicker
              label={tc("tip")}
              percentage={tipPercentage}
              showCustom={showCustomTipInput}
              customTip={customTip}
              onPercentage={(p) => {
                handleTipPercentage(p);
                setShowCustomTipInput(false);
              }}
              onCustomOpen={() => {
                setShowCustomTipInput(true);
                setTipPercentage(0);
              }}
              onCustomChange={handleCustomTipChange}
            />

            {/* Alerta mínimo */}
            {isUnderMinimum && cartState.items.length > 0 && (
              <div className="bg-danger-50 px-6 py-3 -mx-8 rounded-lg mt-4">
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

            {/* Botón de pagar */}
            <div className="mt-6">
              <PayButton onClick={handleContinue} disabled={isUnderMinimum}>
                {tc("payCtaAmount", { amount: formatMoney(totalAmount) })}
              </PayButton>
            </div>
      </FlowStepCard>
    </div>
  );
}

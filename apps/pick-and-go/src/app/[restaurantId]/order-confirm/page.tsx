"use client";

import { PayButton, TipPicker, formatMoney } from "@even/ui";
import { FlowStepCard, useFlowAmount } from "@even/ui/diner";
import { useParams } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useNavigation } from "@/hooks/useNavigation";
import { useRestaurant } from "@/context/RestaurantContext";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import MenuHeaderBack from "@/components/headers/MenuHeaderBack";
import { X, ChevronRight, Loader2, CircleAlert } from "lucide-react";
import { createPortal } from "react-dom";
import { useBranch } from "@/context/BranchContext";
import BranchSelectionModal from "@/components/modals/BranchSelectionModal";
import { calculateCommissions } from "@/utils/commissionCalculator";
import { restaurantService } from "@/services/restaurant.service";
import { cartService } from "@/services/cart.service";
import {
  DEFAULT_TIP_PERCENTAGE,
  readCheckoutDraft,
  writeCheckoutDraft,
} from "@even/cart";
import { computeTipAmount, MINIMUM_AMOUNT } from "@even/payments";
import { useCheckoutPrefetch } from "@/hooks/useCheckoutPrefetch";

export default function OrderConfirmPage() {
  const t = useTranslations("OrderConfirmPage");
  const tc = useTranslations("Common");
  const params = useParams();
  const { setRestaurantId } = useRestaurant();
  const restaurantId = params?.restaurantId as string;

  useEffect(() => {
    if (restaurantId && !isNaN(parseInt(restaurantId))) {
      setRestaurantId(parseInt(restaurantId));
    }
  }, [restaurantId, setRestaurantId]);

  const { state: cartState, refreshCart } = useCart();
  const { navigateWithRestaurantId, changeBranch } = useNavigation();
  const { branches, selectedBranchNumber, fetchBranches } = useBranch();

  const baseAmount = cartState.totalPrice;

  // La propina elegida se conserva al ir a "pago" y volver.
  const [initialDraft] = useState(() => readCheckoutDraft(restaurantId));
  const [tipPercentage, setTipPercentage] = useState(
    initialDraft?.tipPercentage ?? DEFAULT_TIP_PERCENTAGE,
  );
  const [customTip, setCustomTip] = useState(initialDraft?.customTip ?? "");
  const [showCustomTipInput, setShowCustomTipInput] = useState(
    initialDraft?.showCustomTipInput ?? false,
  );
  const [scheduledPickupTime, setScheduledPickupTime] = useState<string | null>(
    null,
  );
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showBranchChangeConfirmModal, setShowBranchChangeConfirmModal] =
    useState(false);
  const [pendingBranchChange, setPendingBranchChange] = useState<number | null>(
    null,
  );
  const [itemsToRemove, setItemsToRemove] = useState<typeof cartState.items>(
    [],
  );
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  // El carrito vive en el provider: si ya cargó (vengo del carrito o de "pago")
  // no hay nada que esperar y la tarjeta se pinta completa desde el primer render.
  const [isLoadingInitial, setIsLoadingInitial] = useState(
    !cartState.hasLoaded || cartState.isLoading,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const calculateTipAmount = () => {
    if (customTip && parseFloat(customTip) > 0) {
      return parseFloat(customTip);
    }
    return computeTipAmount(baseAmount, tipPercentage);
  };

  const tipAmount = calculateTipAmount();
  const commissions = calculateCommissions(baseAmount, tipAmount);
  const { totalAmountCharged: totalAmount } = commissions;

  const isUnderMinimum = totalAmount < MINIMUM_AMOUNT;

  // El hero lee este mismo `totalAmount`: es el que cobra el botón de pagar (incluye la comisión de servicio).
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
    writeCheckoutDraft({
      scope: restaurantId,
      tipPercentage,
      customTip,
      showCustomTipInput,
    });
  }, [restaurantId, tipPercentage, customTip, showCustomTipInput]);

  // Ya en la confirmación se calienta el siguiente paso (pago).
  useCheckoutPrefetch(["card-selection"]);

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
      navigateWithRestaurantId("/menu", { replace: true });
    }
  }, [
    cartState.hasLoaded,
    cartState.isLoading,
    cartState.items.length,
    navigateWithRestaurantId,
  ]);

  useEffect(() => {
    if (restaurantId) {
      fetchBranches(parseInt(restaurantId));
    }
  }, [restaurantId, fetchBranches]);

  const handleTipPercentage = (percentage: number) => {
    setTipPercentage(percentage);
    setCustomTip("");
  };

  const handleCustomTipChange = (value: string) => {
    setCustomTip(value);
    setTipPercentage(0);
  };

  const checkItemsAvailability = async (newBranchNumber: number) => {
    setIsCheckingAvailability(true);
    try {
      const menuData = await restaurantService.getRestaurantWithMenuByBranch(
        parseInt(restaurantId),
        newBranchNumber,
      );
      const availableMenuItemIds = new Set<number>();
      menuData.menu.forEach((section) => {
        section.items.forEach((item) => {
          availableMenuItemIds.add(item.id);
        });
      });
      const unavailableItems = cartState.items.filter(
        (cartItem) => !availableMenuItemIds.has(cartItem.id),
      );
      setItemsToRemove(unavailableItems);
      return unavailableItems;
    } catch (error) {
      console.error("Error checking items availability:", error);
      setItemsToRemove([]);
      return [];
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const handleContinue = () => {
    if (branches.length > 1 && !selectedBranchNumber) {
      setShowBranchModal(true);
      return;
    }
    const qs = new URLSearchParams();
    qs.set("tipAmount", tipAmount.toFixed(2));
    if (scheduledPickupTime) {
      qs.set("scheduledPickupTime", scheduledPickupTime);
    }
    navigateWithRestaurantId(`/card-selection?${qs.toString()}`);
  };

  // Aún sin el carrito: el esqueleto del paso y la transición espera.
  if (isLoadingInitial) {
    return (
      <div className="relative z-10 isolate h-screen overflow-hidden flex flex-col">
        <MenuHeaderBack
          onBack={() => navigateWithRestaurantId("/cart", { replace: true })}
        />
        <FlowStepCard step="order-confirm" loading>
          {null}
        </FlowStepCard>
      </div>
    );
  }

  return (
    <div className="relative z-10 isolate h-screen overflow-hidden flex flex-col">
      <MenuHeaderBack
        onBack={() => navigateWithRestaurantId("/cart", { replace: true })}
      />

      {/* Tarjeta anclada al fondo */}
      <FlowStepCard step="order-confirm">
            {/* Sucursal */}
            {branches.length > 0 && (
              <div
                className={`mb-4 flex items-center justify-between w-full ${branches.length > 1 ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                onClick={() => branches.length > 1 && setShowBranchModal(true)}
              >
                {selectedBranchNumber ? (
                  <p className="text-tone-600 text-base md:text-lg lg:text-xl">
                    {tc("branchLabel")}{" "}
                    <span className="font-medium text-black">
                      {branches.find(
                        (b) => b.branch_number === selectedBranchNumber,
                      )?.name || tc("defaultBranchName")}
                    </span>
                  </p>
                ) : (
                  <p className="text-tone-600 text-sm md:text-base font-medium">
                    {tc("selectBranch")}
                  </p>
                )}
                {branches.length > 1 && (
                  <ChevronRight className="size-4 md:size-5 text-tone-600 flex-shrink-0" />
                )}
              </div>
            )}

            {/* Hora de recolección */}
            {/*<PickupTimeSelector
              selectedTime={scheduledPickupTime}
              onTimeChange={setScheduledPickupTime}
              estimatedMinutes={25}
            />*/}

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
            {isUnderMinimum && totalAmount > 0 && (
              <div className="bg-danger-50 px-6 py-3 -mx-8 rounded-lg mt-4">
                <div className="flex justify-center items-center gap-3">
                  <X className="size-6 text-danger-500 flex-shrink-0" />
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
              <PayButton
                onClick={handleContinue}
                disabled={
                  isUnderMinimum || (branches.length > 1 && !selectedBranchNumber)
                }
              >
                {branches.length > 1 && !selectedBranchNumber
                  ? tc("selectBranch")
                  : tc("payCtaAmount", { amount: formatMoney(totalAmount) })}
              </PayButton>
            </div>
      </FlowStepCard>

      {/* Modal de confirmación de cambio de sucursal */}
      {showBranchChangeConfirmModal && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 99999 }}
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!isCheckingAvailability) {
                setShowBranchChangeConfirmModal(false);
                setPendingBranchChange(null);
                setItemsToRemove([]);
              }
            }}
          />
          <div className="relative bg-white rounded-t-4xl w-full mx-4">
            {isCheckingAvailability ? (
              <div className="px-6 py-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-even-evergreen" />
                <p className="text-tone-600 text-base">
                  {t("verifyingAvailability")}
                </p>
              </div>
            ) : (
              <>
                <div className="px-6 py-4">
                  {itemsToRemove.length > 0 ? (
                    <>
                      <p className="text-tone-600 text-base mb-4">
                        {tc("itemsUnavailableIntro")}
                      </p>
                      <div className="bg-danger-50 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
                        <ul className="space-y-2 text-left">
                          {itemsToRemove.map((item) => (
                            <li
                              key={item.cartItemId || item.id}
                              className="flex items-start gap-2 text-sm"
                            >
                              <X className="size-4 text-danger-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="font-medium text-tone-900">
                                  {item.name}
                                </p>
                                <p className="text-tone-600 text-xs">
                                  {tc("itemQuantityLabel", {
                                    quantity: item.quantity,
                                  })}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <p className="text-tone-600 text-sm mb-4">
                        {tc("otherItemsKept")}
                      </p>
                    </>
                  ) : (
                    <p className="text-tone-600 text-base mb-4">
                      {t("allItemsAvailable")}
                    </p>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-tone-200 sticky bottom-0 bg-white">
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowBranchChangeConfirmModal(false);
                        setPendingBranchChange(null);
                        setItemsToRemove([]);
                      }}
                      className="flex-1 py-3 px-4 border border-tone-300 rounded-full text-black font-medium hover:bg-tone-50 transition-colors"
                    >
                      {tc("cancel")}
                    </button>
                    <button
                      onClick={async () => {
                        if (pendingBranchChange !== null) {
                          try {
                            setIsCheckingAvailability(true);
                            for (const item of itemsToRemove) {
                              if (item.cartItemId) {
                                try {
                                  await cartService.removeFromCart(
                                    item.cartItemId,
                                  );
                                } catch (error) {
                                  console.error(
                                    "Error removing unavailable item:",
                                    error,
                                  );
                                }
                              }
                            }
                            changeBranch(pendingBranchChange);
                            await refreshCart();
                            setIsCheckingAvailability(false);
                            setShowBranchChangeConfirmModal(false);
                            setShowBranchModal(false);
                            setPendingBranchChange(null);
                            setItemsToRemove([]);
                          } catch (error) {
                            console.error("Error during branch change:", error);
                            setIsCheckingAvailability(false);
                            setErrorMessage(t("errorChangeBranch"));
                          }
                        }
                      }}
                      className="flex-1 py-3 px-4 bg-even-grass rounded-full text-even-evergreen font-medium hover:opacity-90 transition-opacity"
                    >
                      {t("continueCta")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorMessage &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/50"
            onClick={() => setErrorMessage(null)}
          >
            <div
              className="bg-white rounded-t-4xl w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 max-w-2xl mx-auto">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-danger-100 flex items-center justify-center mb-4">
                    <CircleAlert
                      className="size-7 text-danger-500"
                      strokeWidth={2}
                    />
                  </div>
                  <h2 className="text-xl font-semibold text-black text-center">
                    {tc("errorTitle")}
                  </h2>
                </div>
                <div className="bg-surface border border-stroke-soft/50 rounded-xl p-4 mb-6">
                  <p className="text-tone-700 text-sm text-center">
                    {errorMessage}
                  </p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
                >
                  {tc("understood")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal selección de sucursal */}
      <BranchSelectionModal
        isOpen={showBranchModal}
        onClose={() => setShowBranchModal(false)}
        onBranchChangeRequested={async (newBranchNumber) => {
          setPendingBranchChange(newBranchNumber);
          setShowBranchModal(false);
          setShowBranchChangeConfirmModal(true);
          setIsCheckingAvailability(true);
          await checkItemsAvailability(newBranchNumber);
        }}
      />
    </div>
  );
}

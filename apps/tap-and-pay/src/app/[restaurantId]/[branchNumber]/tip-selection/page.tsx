"use client";

import { PayButton, TipPicker, formatMoney } from "@even/ui";
import { EqualSplitView, FlowStepCard, useFlowAmount } from "@even/ui/diner";
import { useSearchParams, useParams } from "next/navigation";
import { useEffect, useState, useMemo, useRef } from "react";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useRestaurant } from "@/app/context/RestaurantContext";
import MenuHeader from "@/app/components/headers/MenuHeader";
import { X } from "lucide-react";
import { orderService } from "@/app/services/order.service";
import { calculateCommissions } from "@/app/utils/commissionCalculator";
import { prefetchMsiConfig } from "@/app/hooks/useMsiConfig";
import { useTranslations } from "next-intl";

export default function TipSelectionPage() {
  const t = useTranslations("TipSelectionPage");
  const tc = useTranslations("Common");
  const searchParams = useSearchParams();
  const params = useParams();
  const { state, setTableNumber, loadTableData } = useTable();
  const { tableNumber, navigateWithTable } = useTableNavigation();
  const { setParams, params: restaurantParams, restaurant } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;

  const paymentType = searchParams.get("type") || "full-bill";
  const amount = searchParams.get("amount");

  const [tipPercentage, setTipPercentage] = useState(10);
  const [customTip, setCustomTip] = useState("");
  const [customPaymentAmount, setCustomPaymentAmount] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  // "Dividir cuenta": N local por comensal; "Tu parte" = restante / N.
  const [equalPeople, setEqualPeople] = useState("2");
  const [splitStatus, setSplitStatus] = useState<any>(null);
  // La mesa vive en el provider: si ya hay cuenta cargada se pinta de inmediato
  // y el estado de la división se actualiza en segundo plano.
  const [isLoading, setIsLoading] = useState(
    () => !state.order?.items || state.order.items.length === 0,
  );
  const [showCustomTipInput, setShowCustomTipInput] = useState(false);

  const loadSplitStatus = async () => {
    if (!state.order?.order_id) return;

    try {
      const response = await orderService.getSplitPaymentStatus(
        state.order.order_id,
      );
      if (response.success && response.data) {
        setSplitStatus(response.data);
      } else {
        setSplitStatus(null);
      }
    } catch (error) {
      console.error("Error loading split status:", error);
      setSplitStatus(null);
    }
  };

  // Se calienta la configuración de MSI del paso de pago.
  useEffect(() => {
    prefetchMsiConfig();
  }, []);

  // Establecer restaurantId y branchNumber desde los path params
  useEffect(() => {
    const restaurantId = params?.restaurantId as string;
    const branchNumber = params?.branchNumber as string;

    if (restaurantId && branchNumber) {
      setParams({
        restaurantId,
        branchNumber,
      });
    }
  }, [params, setParams]);

  // Establecer el número de mesa desde los query params
  useEffect(() => {
    const tableParam = searchParams.get("table");
    if (tableParam && tableParam !== state.tableNumber) {
      setTableNumber(tableParam);
    }
  }, [searchParams, setTableNumber, state.tableNumber]);

  // Recargar datos de la mesa
  useEffect(() => {
    const loadData = async () => {
      if (!tableNumber) {
        return;
      }

      if (!restaurantParams?.restaurantId || !restaurantParams?.branchNumber) {
        return;
      }

      if (!state.order) {
        setIsLoading(true);
        await loadTableData();
        await loadSplitStatus();
        setIsLoading(false);
      } else if (state.order?.order_id) {
        if (!state.order.items || state.order.items.length === 0) {
          setIsLoading(true);
          await loadTableData();
          await loadSplitStatus();
          setIsLoading(false);
        } else {
          await loadSplitStatus();
          setIsLoading(false);
        }
      }
    };
    loadData();
  }, [tableNumber, state.order, restaurantParams]);

  // Inicializar customPaymentAmount para choose-amount
  useEffect(() => {
    if (paymentType === "choose-amount" && amount) {
      setCustomPaymentAmount(amount);
    }
  }, [paymentType, amount]);

  // Default de "Dividir cuenta": cantidad de personas activas en la mesa
  // (mínimo 2). Solo se aplica una vez, para no pisar si el usuario ya lo editó.
  const hasSetDefaultPeopleRef = useRef(false);
  useEffect(() => {
    if (
      paymentType === "equal-shares" &&
      !hasSetDefaultPeopleRef.current &&
      state.activeUsers.length > 0
    ) {
      setEqualPeople(String(Math.max(2, state.activeUsers.length)));
      hasSetDefaultPeopleRef.current = true;
    }
  }, [paymentType, state.activeUsers.length]);
  const equalPeopleCount = Math.max(2, parseInt(equalPeople) || 2);

  // Red de seguridad: si al terminar de cargar no queda nada pendiente por
  // pagar (cuenta ya saldada / sin orden activa — link viejo, navegación
  // stale, etc.), no hay nada que hacer en esta pantalla, así que se manda
  // de vuelta a la cuenta de la mesa.
  useEffect(() => {
    if (isLoading) return;
    if (!state.order || (state.order.remaining_amount ?? 0) <= 0) {
      navigateWithTable("/order", true);
    }
  }, [isLoading, state.order, navigateWithTable]);

  // El back gesto/botón del dispositivo cierra este modal en vez de salir
  // de la página.

  const dishes = state.order?.items || [];

  const unpaidDishes = dishes.filter(
    (dish) => dish.payment_status === "not_paid" || !dish.payment_status,
  );
  const paidDishes = dishes.filter((dish) => dish.payment_status === "paid");

  // Usar los totales de la orden directamente (incluye todos los métodos de pago)
  const tableTotalPrice =
    state.order?.total_amount ||
    dishes.reduce(
      (sum, dish) => sum + (dish.price + dish.extra_price) * dish.quantity,
      0,
    );

  // paid_amount de la orden incluye pagos por todos los métodos
  const paidAmount = state.order?.paid_amount || 0;

  // remaining_amount de la orden es lo que falta por pagar
  const unpaidAmount =
    state.order?.remaining_amount || tableTotalPrice - paidAmount;

  const getPaymentAmount = () => {
    switch (paymentType) {
      case "full-bill":
        return unpaidAmount;
      case "equal-shares":
        return parseFloat((unpaidAmount / equalPeopleCount).toFixed(2));
      case "choose-amount":
        return customPaymentAmount ? parseFloat(customPaymentAmount) : 0;
      case "select-items":
        return selectedItems.reduce((sum, itemId) => {
          const dish = unpaidDishes.find((d) => d.id === itemId);
          return (
            sum +
            ((dish?.price || 0) + (dish?.extra_price || 0)) *
              (dish?.quantity || 0)
          );
        }, 0);
      default:
        return amount ? parseFloat(amount) : 0;
    }
  };

  const baseAmount = getPaymentAmount();
  const maxAllowedAmount = unpaidAmount;

  const tipAmount = useMemo(() => {
    if (customTip && parseFloat(customTip) > 0) {
      return parseFloat(customTip);
    }
    return (baseAmount * tipPercentage) / 100;
  }, [customTip, baseAmount, tipPercentage]);

  const commissions = useMemo(() => {
    return calculateCommissions(baseAmount, tipAmount);
  }, [baseAmount, tipAmount]);

  const { evenClientCharge, totalAmountCharged: paymentAmount } = commissions;

  const MINIMUM_AMOUNT = 20;
  const isUnderMinimum = paymentAmount < MINIMUM_AMOUNT;

  // El hero lee este mismo `paymentAmount`: es el que cobra el botón de pagar.
  useFlowAmount(
    isLoading
      ? null
      : {
          total: paymentAmount,
          bill: baseAmount,
          billLabel: paymentType === "equal-shares" ? t("yourShareTitle") : undefined,
          tip: tipAmount,
          commission: evenClientCharge,
        },
  );

  const handleTipPercentage = (percentage: number) => {
    setTipPercentage(percentage);
    setCustomTip("");
  };

  const handleCustomTipChange = (value: string) => {
    setCustomTip(value);
    setTipPercentage(0);
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const handleContinueToCardSelection = () => {
    const queryParams = new URLSearchParams({
      type: paymentType,
      amount: paymentAmount.toString(),
      baseAmount: baseAmount.toString(),
      tipAmount: tipAmount.toString(),
      ...(paymentType === "select-items" && {
        selectedItems: selectedItems.join(","),
      }),
    });

    navigateWithTable(`/card-selection?${queryParams.toString()}`);
  };

  if (!tableNumber) {
    return (
      <div className="min-h-dvh bg-tone-50 flex items-center justify-center">
        <div className="text-center px-4 md:px-6 lg:px-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-medium text-tone-800 mb-4 md:mb-6">
            {tc("invalidTableTitle")}
          </h1>
          <p className="text-tone-600 text-base md:text-lg lg:text-xl">
            {tc("invalidTableMessage")}
          </p>
        </div>
      </div>
    );
  }

  const isSelectItems = paymentType === "select-items";

  // Aún sin la cuenta: el esqueleto del paso (su forma depende del tipo de pago) y la transición espera.
  if (isLoading) {
    return (
      <div className={`bg-even-evergreen flex flex-col app-root ${isSelectItems ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
        <MenuHeader />
        <FlowStepCard step="tip-selection" loading>
          {null}
        </FlowStepCard>
      </div>
    );
  }

  return (
    <div
      className={`bg-even-evergreen flex flex-col app-root ${
        // Con artículos solo la lista de la tarjeta se desplaza: el documento queda a la altura de la pantalla.
        isSelectItems ? "h-dvh overflow-hidden" : "min-h-dvh"
      }`}
    >
      <MenuHeader />

      {paymentType === "equal-shares" ? (
          <EqualSplitView
            tableNumber={tableNumber}
            share={baseAmount}
            people={equalPeopleCount}
            onPeopleChange={(n) => setEqualPeople(String(n))}
            tipPercentage={tipPercentage}
            showCustomTip={showCustomTipInput}
            customTip={customTip}
            onTipPercentage={(p) => {
              handleTipPercentage(p);
              setShowCustomTipInput(false);
            }}
            onCustomTipOpen={() => {
              setShowCustomTipInput(true);
              setTipPercentage(0);
            }}
            onCustomTipChange={handleCustomTipChange}
            tipAmount={tipAmount}
            total={paymentAmount}
            isUnderMinimum={isUnderMinimum}
            disabled={baseAmount <= 0 || isUnderMinimum}
            onContinue={handleContinueToCardSelection}
          />
      ) : (
        <>
          <FlowStepCard
            step="tip-selection"
            // Con artículos la tarjeta mide lo que su contenido hasta llenar la pantalla: la lista se desplaza y el resumen queda fijo.
            cardClassName={
              isSelectItems ? "min-h-0 flex-initial px-0 md:px-0 lg:px-0 pt-8 md:pt-10 lg:pt-12 pb-0 short:pt-4" : undefined
            }
            className={isSelectItems ? "min-h-0" : undefined}
          >
                {/* Seleccionar monto a pagar para choose-amount */}
                {paymentType === "choose-amount" && (
                  <div className="px-8 md:px-10 lg:px-12 mb-6">
                    <div className="flex flex-col w-full items-center">
                      <label className="block text-xl md:text-2xl lg:text-3xl font-medium text-black mb-4 md:mb-5 lg:mb-6">
                        {t("amountToPayLabel")}
                      </label>
                      <div className="w-full max-w-xs">
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-tone-500 text-2xl">
                            $
                          </span>
                          <input
                            type="number"
                            value={customPaymentAmount}
                            onChange={(e) =>
                              setCustomPaymentAmount(e.target.value)
                            }
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className={`w-full pl-8 pr-4 py-3 text-center text-black border-2 rounded-lg focus:outline-none text-2xl font-semibold ${
                              customPaymentAmount &&
                              parseFloat(customPaymentAmount) > maxAllowedAmount
                                ? "border-danger-500 bg-danger-50"
                                : "border-tone-300 focus:border-even-grass"
                            }`}
                          />
                        </div>
                      </div>
                      <p className="text-sm text-tone-500 mt-3">
                        {t("maxAmount", {
                          amount: maxAllowedAmount.toFixed(2),
                        })}
                      </p>
                      {customPaymentAmount &&
                        parseFloat(customPaymentAmount) > maxAllowedAmount && (
                          <p className="text-sm text-danger-600 mt-1">
                            {t("errorAmountExceedsMax")}
                          </p>
                        )}
                    </div>
                  </div>
                )}

                {/* Seleccionar artículos específicos */}
                {paymentType === "select-items" && (
                  <div className="flex min-h-0 flex-col px-8 md:px-10 lg:px-12">
                    {unpaidDishes.length > 0 && (
                      <div className="text-black font-medium text-sm md:text-base lg:text-lg flex gap-10 md:gap-12 lg:gap-14 justify-end flex-none">
                        <span>{tc("qtyLabel")}</span>
                        <span>{tc("priceLabel")}</span>
                      </div>
                    )}
                    <div data-select-items-list className="min-h-0 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain">
                      {unpaidDishes.map((dish) => {
                        const isSelected = selectedItems.includes(dish.id);
                        const dishTotal =
                          (dish.price + dish.extra_price) * dish.quantity;
                        return (
                          <div
                            key={dish.id}
                            onClick={() => toggleItemSelection(dish.id)}
                            className={`py-3 md:py-4 lg:py-5 cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-even-grass/10"
                                : "hover:bg-tone-50"
                            }`}
                          >
                            <div className="flex items-center gap-3 justify-between">
                              <div className="flex items-center gap-3">
                                <div className="shrink-0">
                                  <div
                                    className={`w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 rounded-full border-2 flex items-center justify-center ${
                                      isSelected
                                        ? "border-hue-teal-500 bg-even-grass"
                                        : "border-tone-300"
                                    }`}
                                  >
                                    {isSelected && (
                                      <svg
                                        className="w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 text-white"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M5 13l4 4L19 7"
                                        />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                                {showImages && (
                                  <div className="size-12 md:size-14 lg:size-16 bg-tone-300 rounded-sm flex items-center justify-center">
                                    <img
                                      src={
                                        dish.images[0] ||
                                        "/even/even-asterisk-evergreen.svg"
                                      }
                                      alt="Logo Even"
                                      className="w-full h-full object-cover rounded-sm"
                                    />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base md:text-lg lg:text-xl text-black capitalize">
                                    {dish.item}
                                  </h4>
                                </div>
                              </div>
                              <div className="text-right flex gap-10 md:gap-12 lg:gap-14">
                                <p className="text-black text-base md:text-lg lg:text-xl">
                                  {dish.quantity}
                                </p>
                                <p className="text-black min-w-14 md:min-w-16 lg:min-w-20 text-base md:text-lg lg:text-xl">
                                  ${dishTotal.toFixed(2)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {unpaidDishes.length === 0 && (
                      <p className="text-sm md:text-base lg:text-lg text-tone-500 mt-2 text-center">
                        {t("noPendingItems")}
                      </p>
                    )}
                    {unpaidDishes.length > 0 && selectedItems.length === 0 && (
                      <p className="text-sm md:text-base lg:text-lg text-tone-500 mt-2 text-center">
                        {t("selectItemToContinue")}
                      </p>
                    )}
                  </div>
                )}

                {/* Propina y botón de pagar (el total vive en el hero) */}
                {paymentType !== "select-items" && (
                  <div className="px-8 md:px-10 lg:px-12">
                    <TipPicker
                      label={t("tipLabel")}
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
                    {isUnderMinimum && baseAmount > 0 && (
                      <div className="mt-4 flex items-center gap-3 rounded-lg bg-danger-50 px-4 py-2">
                        <X className="size-6 shrink-0 text-danger-500" />
                        <p className="text-base font-medium text-danger-700 md:text-lg">{t("underMinimumWarning")}</p>
                      </div>
                    )}
                    <div className="mt-6">
                      <PayButton
                        onClick={handleContinueToCardSelection}
                        disabled={
                          baseAmount <= 0 ||
                          (paymentType === "choose-amount" &&
                            (!customPaymentAmount ||
                              parseFloat(customPaymentAmount) <= 0 ||
                              parseFloat(customPaymentAmount) > maxAllowedAmount)) ||
                          isUnderMinimum
                        }
                      >
                        {tc("payCtaAmount", { amount: formatMoney(paymentAmount) })}
                      </PayButton>
                    </div>
                  </div>
                )}
          {/* Propina y botón de pagar: fijos bajo la lista cuando es select-items */}
          {paymentType === "select-items" && (
            <div
              className="flex-none bg-white pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pt-10 lg:pt-12 short:pt-4 short:pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <div className="px-8 md:px-10 lg:px-12">
                <TipPicker
                  label={t("tipLabel")}
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
                {isUnderMinimum && baseAmount > 0 && (
                  <div className="mt-4 flex items-center gap-3 rounded-lg bg-danger-50 px-4 py-2">
                    <X className="size-6 shrink-0 text-danger-500" />
                    <p className="text-base font-medium text-danger-700 md:text-lg">{t("underMinimumWarning")}</p>
                  </div>
                )}
                <div className="mt-6">
                  <PayButton
                    onClick={handleContinueToCardSelection}
                    disabled={baseAmount <= 0 || selectedItems.length === 0 || isUnderMinimum}
                  >
                    {tc("payCtaAmount", { amount: formatMoney(paymentAmount) })}
                  </PayButton>
                </div>
              </div>
            </div>
          )}
          </FlowStepCard>
        </>
      )}

    </div>
  );
}

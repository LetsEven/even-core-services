"use client";

import { formatMoney } from "@even/ui";
import { FlowStepCard, useFlowAmount } from "@even/ui/diner";
import { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useRestaurant } from "@/app/context/RestaurantContext";
import MenuHeader from "@/app/components/headers/MenuHeader";
import { ChevronRight, DollarSign, ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";

export default function PaymentOptionsPage() {
  const t = useTranslations("PaymentOptionsPage");
  const tc = useTranslations("Common");
  const searchParams = useSearchParams();
  const params = useParams();
  const { state, setTableNumber, loadTableData, loadActiveUsers } = useTable();
  const { tableNumber, navigateWithTable } = useTableNavigation();
  const { setParams, params: restaurantParams } = useRestaurant();

  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    const loadPaymentData = async () => {
      // Verificar que tenemos tableNumber antes de intentar cargar
      if (!tableNumber) {
        return;
      }

      // Verificar que los params del restaurante estén listos
      if (!restaurantParams?.restaurantId || !restaurantParams?.branchNumber) {
        return;
      }

      // Si no hay orden, cargarla
      if (!state.order) {
        setIsLoading(true);
        await loadTableData();
        await loadActiveUsers();
        setIsLoading(false);
      } else if (state.order?.order_id) {
        // Si hay orden pero no tiene items, recargar
        if (!state.order.items || state.order.items.length === 0) {
          setIsLoading(true);
          await loadTableData();
          await loadActiveUsers();
          setIsLoading(false);
        } else {
          // Ya hay datos completos, solo recargar activeUsers
          await loadActiveUsers();
          setIsLoading(false);
        }
      }
    };

    loadPaymentData();
  }, [tableNumber, state.order, restaurantParams]);

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

  // Calcular totales usando los datos de la orden
  const dishes = state.order?.items || [];

  // Platillos no pagados y pagados
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

  // Saldo de la cuenta en el hero (el mismo `unpaidAmount` que se paga en las opciones).
  useFlowAmount(
    isLoading
      ? null
      : {
          total: unpaidAmount,
          bill: tableTotalPrice,
          breakdown:
            paidAmount > 0
              ? t("heroPaidBreakdown", { total: formatMoney(tableTotalPrice), paid: formatMoney(paidAmount) })
              : undefined,
        },
  );

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

  const handlePayFullBill = () => {
    if (unpaidAmount <= 0) {
      alert(t("errorNoUnpaidBill"));
      return;
    }

    const queryParams = new URLSearchParams({
      amount: unpaidAmount.toString(),
      type: "full-bill",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleSelectItems = () => {
    if (unpaidDishes.length === 0) {
      alert(t("errorNoUnpaidItems"));
      return;
    }

    const queryParams = new URLSearchParams({
      type: "select-items",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleEqualShares = () => {
    if (unpaidAmount <= 0) {
      alert(t("errorNoUnpaidBill"));
      return;
    }

    // El monto real se calcula en vivo en tip-selection según la cantidad de
    // personas que se elija ahí (dividir cuenta ya no usa un monto fijo
    // precomputado aquí).
    const queryParams = new URLSearchParams({
      type: "equal-shares",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleChooseAmount = () => {
    if (unpaidAmount <= 0) {
      alert(t("errorNoUnpaidBill"));
      return;
    }

    const queryParams = new URLSearchParams({
      type: "choose-amount",
      maxAmount: unpaidAmount.toString(),
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-even-evergreen flex flex-col app-root">
        <MenuHeader />
        <FlowStepCard step="payment-options" loading>
          {null}
        </FlowStepCard>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-even-evergreen flex flex-col app-root">
      <MenuHeader />

      <FlowStepCard step="payment-options">
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto pb-8">
              {/* 4 OPCIONES PRINCIPALES DE PAGO */}
              <div className="flex flex-col mt-4 md:mt-6">
                {/* Opción 1: Pagar cuenta restante */}
                {unpaidAmount > 0 && (
                  <button
                    onClick={handlePayFullBill}
                    className="w-full bg-white cursor-pointer border-b border-stroke active:bg-even-grass/10 transition-all duration-300"
                  >
                    <div className="flex items-center gap-4 md:gap-5 lg:gap-6 py-4 short:py-3 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6">
                      <div className="size-16 md:size-20 lg:size-24 rounded-sm md:rounded-md border border-black flex items-center justify-center">
                        <ReceiptText
                          className="text-black size-9 md:size-11 lg:size-12"
                          strokeWidth={1}
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-black text-lg md:text-xl lg:text-2xl">
                          {t("payFullBill")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}

                {/* Opción 2: Seleccionar platillos específicos */}
                {unpaidDishes.length > 0 && (
                  <button
                    onClick={handleSelectItems}
                    className="w-full bg-white cursor-pointer border-b border-stroke active:bg-even-grass/10 transition-all duration-300"
                  >
                    <div className="flex items-center gap-4 md:gap-5 lg:gap-6 py-4 short:py-3 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6">
                      <div className="size-16 md:size-20 lg:size-24 rounded-sm md:rounded-md border border-black flex items-center justify-center">
                        <img
                          src="/icons/select-items-logo.svg"
                          alt=""
                          className="rounded-sm md:rounded-md"
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-black text-lg md:text-xl lg:text-2xl">
                          {t("selectItems")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}

                {/* Opción 3: Dividir cuenta */}
                {unpaidAmount > 0 && (
                  <button
                    onClick={handleEqualShares}
                    className="w-full bg-white cursor-pointer border-b border-stroke active:bg-even-grass/10 transition-all duration-300"
                  >
                    <div className="flex items-center gap-4 md:gap-5 lg:gap-6 py-4 short:py-3 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6">
                      <div className="size-16 md:size-20 lg:size-24 rounded-sm md:rounded-md border border-black flex items-center justify-center">
                        <img
                          src="/icons/split-bill-logo.png"
                          alt=""
                          className="size-9 md:size-11 lg:size-12"
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-black text-lg md:text-xl lg:text-2xl">
                          {t("splitBill")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}

                {/* Opción 4: Elegir monto personalizado */}
                {unpaidAmount > 0 && (
                  <button
                    onClick={handleChooseAmount}
                    className="w-full bg-white cursor-pointer active:bg-even-grass/10 transition-all duration-300"
                  >
                    <div className="flex items-center gap-4 md:gap-5 lg:gap-6 py-4 short:py-3 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6">
                      <div className="size-16 md:size-20 lg:size-24 rounded-sm md:rounded-md border border-black flex items-center justify-center">
                        <DollarSign
                          className="text-black size-9 md:size-11 lg:size-12"
                          strokeWidth={1}
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-black text-lg md:text-xl lg:text-2xl">
                          {t("chooseAmount")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>
      </FlowStepCard>
    </div>
  );
}

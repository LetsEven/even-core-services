"use client";

import { formatMoney } from "@even/ui";
import { FlowStepCard, useFlowAmount } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { getRestaurantData } from "@/app/utils/restaurantData";
import { getSavedUrlParams, clearSavedUrlParams } from "@/app/utils/urlParams";
import MenuHeaderBack from "@/app/components/headers/MenuHeaderBack";
import { ChevronRight, DollarSign, ReceiptText } from "lucide-react";
import { useValidateAccess } from "@/app/hooks/useValidateAccess";
import ValidationError from "@/app/components/ValidationError";
import { useAgentStatus } from "@/app/hooks/useAgentStatus";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { POSBlockedModal } from "@even/ui/diner";

export default function PaymentOptionsPage() {
  const t = useTranslations("PaymentOptionsPage");
  const { validationError, restaurantId, branchNumber } = useValidateAccess();
  const { restaurant } = useRestaurant();
  const { isAgentDisconnected, isTurnoClosed } = useAgentStatus(
    restaurantId,
    branchNumber ? parseInt(branchNumber) : null,
  );
  const isPOSBlocked = isAgentDisconnected || isTurnoClosed;
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [posModalReason, setPosModalReason] = useState<
    "turno_closed" | "agent_disconnected"
  >("turno_closed");

  const checkPOSBlock = () => {
    if (isPOSBlocked) {
      setPosModalReason(isTurnoClosed ? "turno_closed" : "agent_disconnected");
      setShowPOSModal(true);
      return true;
    }
    return false;
  };
  const searchParams = useSearchParams();

  const { state, dispatch, loadTableData, loadActiveUsers } = useTable();
  const { navigateWithTable } = useTableNavigation();

  // Establecer tableNumber desde URL si no está en el estado
  useEffect(() => {
    const tableFromUrl = searchParams?.get("table");
    if (tableFromUrl && !state.tableNumber) {
      dispatch({ type: "SET_TABLE_NUMBER", payload: tableFromUrl });
    }
  }, [searchParams, state.tableNumber, dispatch]);
  const router = useRouter();
  const restaurantData = getRestaurantData();
  const [isLoading, setIsLoading] = useState(true);
  // Si el usuario ya había cargado esta mesa antes (p. ej. viene de vuelta
  // de pagar un monto parcial), el Context conserva dishOrders/tableSummary
  // desactualizados — hay que refrescarlos una vez por cada vez que se monta
  // esta pantalla, no solo cuando están vacíos.
  const hasRefreshedOnMountRef = useRef(false);

  useEffect(() => {
    const savedParams = getSavedUrlParams();
    if (savedParams) {
      router.replace(`/payment-options${savedParams}`);
      clearSavedUrlParams();
    }
  }, [router]);

  useEffect(() => {
    const loadPaymentData = async () => {
      if (state.tableNumber) {
        // Primer paso de este montaje: refrescar siempre, aunque el Context
        // ya traiga datos — pueden ser de antes de un pago (p. ej. volviste
        // aquí después de pagar un monto parcial y el saldo cambió).
        if (
          !hasRefreshedOnMountRef.current ||
          !state.dishOrders ||
          state.dishOrders.length === 0 ||
          !state.tableSummary
        ) {
          hasRefreshedOnMountRef.current = true;
          setIsLoading(true);
          await loadTableData();
          await loadActiveUsers();
          setIsLoading(false);
        } else {
          // Ya se refrescó en este montaje, solo recargar activeUsers (pueden haber cambiado por pagos)
          await loadActiveUsers();
          setIsLoading(false);
        }
      } else if (!state.tableNumber && !isLoading) {
        // Si no hay número de mesa, mantenerse en loading
      }
    };

    loadPaymentData();
  }, [state.tableNumber, state.dishOrders, state.tableSummary]);

  // Si esta pantalla se restaura desde el bfcache del navegador (p. ej. el
  // usuario le da "atrás" después de pagar), el evento anterior nunca corre
  // de nuevo: React ni siquiera vuelve a montar el componente, solo se
  // repinta el snapshot congelado de antes del pago — de ahí que
  // hasRefreshedOnMountRef nunca ayude en ese caso. pageshow con
  // event.persisted=true es la señal estándar de esa restauración.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && state.tableNumber) {
        setIsLoading(true);
        loadTableData()
          .then(() => loadActiveUsers())
          .finally(() => setIsLoading(false));
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [state.tableNumber, loadTableData, loadActiveUsers]);

  // Calcular totales usando tableSummary si está disponible
  const dishOrders = Array.isArray(state.dishOrders) ? state.dishOrders : [];

  // Platillos no pagados y pagados
  const unpaidDishes = dishOrders.filter(
    (dish) => dish.payment_status === "not_paid" || !dish.payment_status,
  );
  const paidDishes = dishOrders.filter(
    (dish) => dish.payment_status === "paid",
  );

  // Usar tableSummary.data.data si está disponible, sino calcular desde dishOrders
  const tableTotalPrice =
    state.tableSummary?.data?.data?.total_amount ||
    dishOrders.reduce((sum, dish) => sum + (dish.total_price || 0), 0);

  const paidAmount =
    state.tableSummary?.data?.data?.paid_amount ||
    paidDishes.reduce((sum, dish) => sum + (dish.total_price || 0), 0);

  const unpaidAmount =
    state.tableSummary?.data?.data?.remaining_amount ||
    unpaidDishes.reduce((sum, dish) => sum + (dish.total_price || 0), 0);

  // Versiones para mostrar en pantalla (comisión ya incrustada) — nunca se
  // usan para armar los montos que se mandan a tip-selection, solo para que
  // el resumen de esta pantalla cuadre con lo que se ve después.
  const displayTableTotalPrice = dishOrders.reduce(
    (sum, dish) => sum + (dish.total_display_price ?? dish.total_price ?? 0),
    0,
  );
  // paidDishes solo cubre pagos atados a platillos específicos
  // (select-items/user-items) — un pago genérico (full-bill/choose-amount/
  // "Dividir cuenta") no marca ningún dish_order como paid, así que sumar
  // solo paidDishes deja "Pagado" en $0 aunque tableSummary.paid_amount ya
  // refleje el pago real. Se prorratea el paidAmount real (de tableSummary,
  // que sí ve pagos genéricos) sobre el total ya inflado, en vez de sumar
  // por platillo.
  const displayPaidAmount =
    tableTotalPrice > 0
      ? Math.min(
          displayTableTotalPrice * (paidAmount / tableTotalPrice),
          displayTableTotalPrice,
        )
      : 0;
  const displayUnpaidAmount = Math.max(
    displayTableTotalPrice - displayPaidAmount,
    0,
  );

  const tableTotalItems =
    state.tableSummary?.data?.data?.no_items || dishOrders.length;

  // Red de seguridad: si ya no queda nada pendiente por pagar en la mesa
  // (link viejo, ya se pagó todo por fuera, etc.) no hay opciones de pago
  // que mostrar — se manda al usuario de vuelta al menú (mismo criterio
  // "cuenta pagada completamente" que ya usa el mensaje de abajo).
  useEffect(() => {
    if (!isLoading && unpaidAmount <= 0) {
      navigateWithTable("/menu", true);
    }
  }, [isLoading, unpaidAmount, navigateWithTable]);

  // Saldo de la cuenta en el hero (el mismo `displayUnpaidAmount` que se ve en las opciones).
  useFlowAmount(
    isLoading
      ? null
      : {
          total: displayUnpaidAmount,
          bill: displayTableTotalPrice,
          breakdown:
            paidAmount > 0
              ? t("heroPaidBreakdown", {
                  total: formatMoney(displayTableTotalPrice),
                  paid: formatMoney(displayPaidAmount),
                })
              : undefined,
        },
  );

  // Mostrar error de validación si existe
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  // Obtener usuarios únicos considerando active_users que NO hayan pagado nada
  // (solo un estimado para el preview del botón "Dividir cuenta" — la selección
  // real de personas/platillos se hace en tip-selection)
  const uniqueUsers = (() => {
    // Si tenemos activeUsers, usar esa información
    if (state.activeUsers && state.activeUsers.length > 0) {
      const usersWithNoPaid = state.activeUsers
        .filter((user) => {
          const totalPaid =
            (user.total_paid_individual || 0) + (user.total_paid_amount || 0);
          return totalPaid === 0;
        })
        .map((user) => user.guest_name)
        .filter(Boolean);

      return [...new Set(usersWithNoPaid)]; // Asegurar unicidad
    }

    // Fallback: usar usuarios con platillos no pagados
    const usersFromDishes = Array.from(
      new Set(unpaidDishes.map((dish) => dish.guest_name).filter(Boolean)),
    );

    return usersFromDishes;
  })();

  // Platillos del usuario actual
  const currentUserDishes = dishOrders.filter(
    (dish) => dish.guest_name === state.currentUserName,
  );

  const currentUserUnpaidDishes = currentUserDishes.filter(
    (dish) => dish.payment_status === "not_paid" || !dish.payment_status,
  );

  const currentUserUnpaidAmount = currentUserUnpaidDishes.reduce(
    (sum, dish) => {
      return sum + (dish.total_price || 0);
    },
    0,
  );

  const handlePayFullBill = () => {
    if (checkPOSBlock()) return;
    if (unpaidAmount <= 0) {
      alert(t("noPendingBill"));
      return;
    }

    const queryParams = new URLSearchParams({
      amount: unpaidAmount.toString(),
      type: "full-bill",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleSelectItems = () => {
    if (checkPOSBlock()) return;
    if (unpaidDishes.length === 0) {
      alert(t("noPendingDishes"));
      return;
    }

    const queryParams = new URLSearchParams({
      type: "select-items",
      userName: state.currentUserName || "",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleEqualShares = () => {
    if (checkPOSBlock()) return;
    if (unpaidAmount <= 0) {
      alert(t("noPendingBill"));
      return;
    }

    // Entre cuántas personas se elige en tip-selection.
    const queryParams = new URLSearchParams({
      type: "equal-shares",
      userName: state.currentUserName || "",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handleChooseAmount = () => {
    if (checkPOSBlock()) return;
    if (unpaidAmount <= 0) {
      alert(t("noPendingBill"));
      return;
    }

    const queryParams = new URLSearchParams({
      type: "choose-amount",
      userName: state.currentUserName || "",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  const handlePayCurrentUser = () => {
    if (checkPOSBlock()) return;
    if (currentUserUnpaidAmount <= 0) {
      alert(t("noPendingUserDishes"));
      return;
    }

    const queryParams = new URLSearchParams({
      amount: currentUserUnpaidAmount.toString(),
      type: "user-items",
      userName: state.currentUserName || "",
    });

    navigateWithTable(`/tip-selection?${queryParams.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh brand-evergreen flex flex-col app-root">
        <MenuHeaderBack
          restaurant={restaurantData}
          tableNumber={state.tableNumber}
        />
        <FlowStepCard step="payment-options" loading>
          {null}
        </FlowStepCard>
      </div>
    );
  }

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col app-root">
      <MenuHeaderBack
        restaurant={restaurantData}
        tableNumber={state.tableNumber}
      />

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
                          {t("payFullBillTitle")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}

                {/* Opción 2: Seleccionar platillos específicos (TODOS los items disponibles) */}
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
                          {t("selectItemsTitle")}
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
                          {t("splitBillTitle")}
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
                          {t("chooseAmountTitle")}
                        </h3>
                      </div>
                      <div className="text-black">
                        <ChevronRight className="size-5 md:size-6 lg:size-7" />
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Mensaje si no hay platillos pendientes */}
              {unpaidAmount <= 0 && (
                <div className="my-8 md:my-10 lg:my-12 text-center px-6 md:px-8 lg:px-10">
                  <div className="p-6 md:p-8 lg:p-10 bg-even-grass/10 rounded-lg md:rounded-xl">
                    <h3 className="text-lg md:text-xl lg:text-2xl font-medium text-even-evergreen mb-2 md:mb-3">
                      {t("billFullyPaid")}
                    </h3>
                    <p className="text-even-shamrock text-base md:text-lg lg:text-xl">
                      {t("allDishesPaidMessage")}
                    </p>
                  </div>
                </div>
              )}
            </div>
      </FlowStepCard>
      <POSBlockedModal
        isOpen={showPOSModal}
        onClose={() => setShowPOSModal(false)}
        reason={posModalReason}
        restaurantName={restaurant?.name}
        restaurantLogo={restaurant?.logo_url}
      />
    </div>
  );
}

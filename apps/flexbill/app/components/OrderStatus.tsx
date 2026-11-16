"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeClosed, Loader, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTable } from "../context/TableContext";
import { useTableNavigation } from "../hooks/useTableNavigation";
import { getRestaurantData } from "../utils/restaurantData";
import MenuHeaderBackOrder from "./headers/MenuHeaderBackOrder";
import ItemCustomizations from "@/app/components/ItemCustomizations";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { ReceiptPaper, ReceiptRow, ReceiptRule } from "@even/ui";

export default function OrderStatus() {
  const { restaurant: menuRestaurant } = useRestaurant();
  const showImages =
    !!menuRestaurant && menuRestaurant.menu_show_images !== false;
  const t = useTranslations("OrderStatus");
  const tc = useTranslations("Common");
  const { state, loadTableData, syncOrderFromPOS, joinTableWithoutOrdering } =
    useTable();
  const { navigateWithTable } = useTableNavigation();
  const { isAuthenticated, isLoading } = useAuth();
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showPaidOrders, setShowPaidOrders] = useState(false);
  // useRef en vez de useState: en React Strict Mode los effects se
  // double-invocan al montar sobre el mismo closure (sin re-render de por
  // medio), así que un useState no alcanza a "verse" actualizado entre
  // ambas invocaciones y el guard no protege nada.
  const hasLoadedInitialDataRef = useRef(false);
  const restaurantData = getRestaurantData();

  const handleRefresh = async () => {
    // Best-effort: jala platillos agregados directo en el POS antes de
    // refrescar — si falla (sin POS integrado, agente desconectado), se
    // ignora y el refresh local sigue de todas formas.
    await syncOrderFromPOS();
    loadTableData();
  };

  // Autenticado -> flujo normal directo a pagar. Invitado -> auth-selection,
  // donde "Continuar como invitado" lleva a /user en modo "joinOnly", que es
  // donde realmente se une a la mesa (requisito: "unirse sin ordenar").
  const handleCheckOut = async () => {
    setIsProcessingPayment(true);
    try {
      if (!isLoading && isAuthenticated) {
        // Si aún no ordenó, esto lo registra en active_users (upsert, no
        // duplica si ya estaba); si ya ordenó, no-op relevante.
        await joinTableWithoutOrdering();
        navigateWithTable("/payment-options");
      } else {
        navigateWithTable("/auth-selection");
      }
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Filtrar platillos pagados y no pagados
  const unpaidDishes = Array.isArray(state.dishOrders)
    ? state.dishOrders.filter((dish) => dish.payment_status === "not_paid")
    : [];
  const paidDishes = Array.isArray(state.dishOrders)
    ? state.dishOrders.filter((dish) => dish.payment_status === "paid")
    : [];

  // Totales de la mesa — se suman desde los platillos (total_display_price,
  // con la comisión de Flex Bill ya incrustada) en vez de usar directo
  // tableSummary.total_amount/paid_amount/remaining_amount, que son montos
  // reales sin inflar. Así el encabezado cuadra contra las líneas de abajo.
  const tableTotalItems =
    state.tableSummary?.data?.data?.no_items || state.dishOrders?.length || 0;
  const tableTotalPrice =
    state.dishOrders?.reduce(
      (sum, dish) => sum + (dish.total_display_price ?? dish.total_price),
      0,
    ) || 0;
  // paidDishes solo cubre pagos atados a platillos específicos — un pago
  // genérico (full-bill/choose-amount/"Dividir cuenta") no marca ningún
  // dish_order como paid, así que sumar solo paidDishes deja esto en $0
  // aunque tableSummary.paid_amount ya refleje el pago real. Se prorratea
  // el paid_amount real (tableSummary) sobre el total ya inflado, igual que
  // en payment-options/page.tsx y tip-selection/page.tsx.
  const realTableTotalPrice =
    state.tableSummary?.data?.data?.total_amount ||
    (state.dishOrders?.reduce(
      (sum, dish) => sum + (dish.total_price || 0),
      0,
    ) ??
      0);
  const realPaidAmount =
    state.tableSummary?.data?.data?.paid_amount ||
    paidDishes.reduce((sum, dish) => sum + (dish.total_price || 0), 0);
  const tablePaidAmount =
    realTableTotalPrice > 0
      ? Math.min(
          tableTotalPrice * (realPaidAmount / realTableTotalPrice),
          tableTotalPrice,
        )
      : 0;
  const tableRemainingAmount = Math.max(tableTotalPrice - tablePaidAmount, 0);

  // Calcular totales de platillos pagados
  const paidTotalItems = paidDishes.length;
  const paidTotalPrice = paidDishes.reduce(
    (sum, dish) => sum + (dish.total_display_price ?? dish.total_price),
    0,
  );

  // Cargar datos cuando se monta el componente o cambia el número de mesa
  useEffect(() => {
    if (state.tableNumber && !hasLoadedInitialDataRef.current) {
      hasLoadedInitialDataRef.current = true;

      // Call API directly to debug
      loadTableData()
        .then(() => {})
        .catch((error) => {
          console.error("❌ loadTableData failed:", error);
        });
    }
  }, [state.tableNumber]); // Removed loadTableData from dependencies

  const isTableClosed = state.tableSummary?.data?.data?.status === "paid";
  // La hoja se monta hasta tener la primera carga (si no, la animación corre
  // sobre una cuenta vacía); los refrescos posteriores no la reinician.
  const [receiptReady, setReceiptReady] = useState(false);
  useEffect(() => {
    if (!state.isLoading) setReceiptReady(true);
  }, [state.isLoading]);

  const statusMap: Record<string, string> = {
    preparing: tc("statusPreparing"),
    ready: tc("statusReady"),
    delivered: tc("statusDelivered"),
  };

  const renderDishRow = (dish: (typeof unpaidDishes)[number], paid: boolean) => {
    const lineTotal = dish.total_display_price ?? dish.total_price;
    const promoLabel = dish.is_promo_item
      ? dish.promo_discount_percentage != null &&
        dish.promo_discount_percentage >= 100
        ? t("freeLabel")
        : dish.promo_discount_percentage != null
          ? t("percentOff", { percent: dish.promo_discount_percentage })
          : t("promoBadge")
      : null;
    return (
      <ReceiptRow
        key={`${paid ? "paid-" : ""}${dish.dish_order_id}`}
        left={
          <span className="capitalize">
            {dish.quantity}x {dish.item}
          </span>
        }
        right={`$${lineTotal.toFixed(2)}`}
        sub={
          <>
            <span className="uppercase">{dish.guest_name}</span>
            {paid ? (
              <span className="text-even-shamrock"> · {t("paidBadge")}</span>
            ) : (
              <span> · {statusMap[dish.status] || dish.status}</span>
            )}
            {promoLabel && (
              <span className="uppercase text-even-shamrock"> · {promoLabel}</span>
            )}
            <ItemCustomizations
              customFields={dish.custom_fields}
              formatPrice={(price) =>
                price * (lineTotal / (dish.total_price || 1))
              }
            />
          </>
        }
      />
    );
  };

  return (
    <div className="min-h-dvh brand-evergreen flex flex-col app-root">
      <MenuHeaderBackOrder
        restaurant={restaurantData}
        tableNumber={state.tableNumber}
      />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="left-4 right-4 bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
            <h1 className="font-medium text-white/60 text-xl md:text-2xl lg:text-3xl">
              {tc("tableLabel", { table: state.tableNumber })}
            </h1>
            <h2 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
              {t("subtitle")}
            </h2>
          </div>
        </div>

        <div className="flex-1 h-full flex flex-col overflow-hidden">
          <div
            className={`rounded-t-4xl flex-1 z-5 flex flex-col overflow-hidden ${
              isTableClosed ? "bg-white" : "bg-even-evergreen"
            }`}
          >
            {/* Table Closed Message */}
            {isTableClosed ? (
              <div className="flex-1 flex items-center justify-center py-8 md:py-12 text-center">
                <div>
                  <div className="mb-4 md:mb-6">
                    <div className="w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 mx-auto bg-even-grass/20 rounded-full flex items-center justify-center">
                      <svg
                        className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 text-even-shamrock"
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
                    </div>
                  </div>
                  <h2 className="text-2xl md:text-3xl lg:text-4xl font-medium text-even-shamrock mb-2 md:mb-3">
                    {t("tableClosedTitle")}
                  </h2>
                  <p className="text-tone-600 text-base md:text-lg lg:text-xl mb-4 md:mb-6">
                    {t("tableClosedMessage")}
                  </p>
                  <button
                    onClick={handleRefresh}
                    className="bg-even-grass text-even-evergreen px-6 md:px-8 lg:px-10 py-2 md:py-3 lg:py-4 rounded-full transition-colors active:scale-95 text-base md:text-lg lg:text-xl"
                  >
                    {t("refreshCta")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Scrollable content: la cuenta como ticket de papel */}
                <div className="flex-1 overflow-y-auto px-3 md:px-6 pt-6 pb-35 md:pb-40 lg:pb-45">
                  {!receiptReady ? (
                    <div className="flex justify-center pt-16">
                      <Loader className="h-8 w-8 md:h-10 md:w-10 animate-spin text-even-grass" />
                    </div>
                  ) : (
                    <div className="mx-auto w-full max-w-xl">
                      <ReceiptPaper mode="appear">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="font-mono text-base font-bold uppercase tracking-wide">
                              {restaurantData.name}
                            </h2>
                            <p className="text-xs text-even-ink/55">
                              {t("sharedBillTitle")} ·{" "}
                              {tc("tableLabel", { table: state.tableNumber })}
                            </p>
                          </div>
                          <button
                            onClick={handleRefresh}
                            disabled={state.isLoading}
                            aria-label={t("refreshCta")}
                            className="shrink-0 text-even-shamrock disabled:text-tone-400 cursor-pointer"
                          >
                            <svg
                              className={`size-5 ${state.isLoading ? "animate-spin" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                          </button>
                        </div>
                        <ReceiptRule />

                        {unpaidDishes.length === 0 ? (
                          <p className="py-6 text-center text-sm">
                            {t("noOrdersYet")}
                          </p>
                        ) : (
                          <div>
                            {unpaidDishes.map((dish) =>
                              renderDishRow(dish, false),
                            )}
                          </div>
                        )}

                        {unpaidDishes.length > 0 && (
                          <>
                            <ReceiptRule />
                            <ReceiptRow
                              strong
                              left={t("subtotal")}
                              right={`$${tableTotalPrice.toFixed(2)}`}
                            />
                            {tablePaidAmount > 0 && (
                              <>
                                <ReceiptRow
                                  left={t("totalPaid")}
                                  right={`-$${tablePaidAmount.toFixed(2)}`}
                                />
                                <ReceiptRow
                                  strong
                                  left={t("remainingLabel")}
                                  right={`$${tableRemainingAmount.toFixed(2)}`}
                                />
                              </>
                            )}
                          </>
                        )}

                        {/* Artículos pagados */}
                        {paidDishes.length > 0 && (
                          <>
                            <ReceiptRule />
                            <button
                              onClick={() => setShowPaidOrders(!showPaidOrders)}
                              className="flex w-full items-center justify-between text-sm text-even-shamrock cursor-pointer"
                            >
                              <span className="font-bold uppercase">
                                {t("paidItemsTitle")} ({paidTotalItems})
                              </span>
                              <span className="flex items-center gap-1">
                                {showPaidOrders ? (
                                  <EyeClosed className="size-4" />
                                ) : (
                                  <Eye className="size-4" />
                                )}
                                {showPaidOrders ? t("hideCta") : t("showCta")}
                              </span>
                            </button>
                            {showPaidOrders && (
                              <div className="mt-1">
                                {paidDishes.map((dish) =>
                                  renderDishRow(dish, true),
                                )}
                                <ReceiptRow
                                  strong
                                  left={t("totalPaid")}
                                  right={`$${paidTotalPrice.toFixed(2)}`}
                                />
                              </div>
                            )}
                          </>
                        )}
                      </ReceiptPaper>
                    </div>
                  )}
                </div>

                {/* Fixed bottom section */}
                {unpaidDishes.length > 0 && tableRemainingAmount > 0 && (
                  <div
                    className="fixed fixed-col bottom-0 bg-even-evergreen mx-4 md:mx-6 lg:mx-8 px-6 md:px-8 lg:px-10 z-50 border-t border-white/10"
                    style={{
                      paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
                    }}
                  >
                    <div className="pt-4 flex justify-between items-center">
                      <span className="font-medium text-white/70 text-base md:text-lg lg:text-xl">
                        {t("subtotal")}
                      </span>
                      <span className="font-medium text-white text-base md:text-lg lg:text-xl">
                        ${tableTotalPrice.toFixed(2)} MXN
                      </span>
                    </div>

                    <button
                      onClick={handleCheckOut}
                      disabled={
                        isProcessingPayment || tableRemainingAmount <= 0
                      }
                      className={`mt-4 md:mt-5 w-full py-3 md:py-4 lg:py-5 rounded-full font-medium active:scale-95 transition-all bg-even-grass text-even-evergreen text-base md:text-lg lg:text-xl ${
                        !isProcessingPayment && tableRemainingAmount > 0
                          ? "cursor-pointer"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      {isProcessingPayment ? (
                        <div className="flex items-center justify-center gap-2 md:gap-3">
                          <Loader2 className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 animate-spin" />
                          <span>{t("loadingCta")}</span>
                        </div>
                      ) : tableRemainingAmount <= 0 ? (
                        t("billFullyPaid")
                      ) : (
                        t("continueCta")
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

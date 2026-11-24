"use client";

import { useState } from "react";
import { Loader2, ReceiptText, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { ItemCustomizations } from "@even/ui/diner";
import MenuHeader from "@/app/components/headers/MenuHeader";
import AccountMenu from "@/app/components/AccountMenu";
import { useAuth } from "@/app/context/AuthContext";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { useRetailOrder } from "@/app/context/RetailOrderContext";
import { useBranchNavigation } from "@/app/hooks/useBranchNavigation";
import { dishTotal } from "@/app/types/order";

export default function RetailOrderPage() {
  const t = useTranslations("RetailOrder");
  const tc = useTranslations("Common");
  const { order, loading, error, lastClosed, reload } = useRetailOrder();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    // Mínimo visible para que se note que sí consultó
    await Promise.all([reload(), new Promise((r) => setTimeout(r, 600))]);
    setRefreshing(false);
  };
  const { restaurant } = useRestaurant();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { navigate } = useBranchNavigation();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;

  const handleContinue = () => {
    if (!order || order.en_cobro) return;
    navigate(isAuthenticated ? "/card-selection" : "/auth-selection");
  };

  return (
    <div className="min-h-dvh bg-even-evergreen flex flex-col">
      <MenuHeader showBackButton={false} leftSlot={<AccountMenu />} />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        <div className="bg-even-evergreen rounded-t-4xl translate-y-7 z-0">
          <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center">
            <h1 className="font-medium text-white/60 text-xl md:text-2xl lg:text-3xl">
              {restaurant?.name ?? ""}
            </h1>
            <h2 className="font-medium text-white text-3xl md:text-4xl lg:text-5xl leading-7 md:leading-9 lg:leading-tight mt-2 md:mt-3 mb-6 md:mb-8">
              {order ? t("title", { folio: order.folio ?? "" }) : t("waitingTitle")}
            </h2>
          </div>
        </div>

        <div className="flex-1 h-full flex flex-col overflow-hidden relative">
          <div className="bg-white rounded-t-4xl flex-1 z-5 flex flex-col overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="size-10 animate-spin text-even-grass" />
              </div>
            ) : !order ? (
              // Mismo estado vacío que la cuenta de Tap & Pay
              <div className="flex flex-col items-center text-center px-8 pt-12 md:pt-16 pb-8">
                <div className="relative mb-6">
                  <span className="absolute inset-0 rounded-full bg-even-grass/30 animate-ping" />
                  <div className="relative size-20 md:size-24 rounded-full flex items-center justify-center bg-even-grass/20">
                    <ReceiptText className="size-10 md:size-12 text-even-evergreen" />
                  </div>
                </div>
                {lastClosed === "cancelled" && (
                  <p className="mb-2 text-sm text-danger-600">{t("cancelledNotice")}</p>
                )}
                <h3 className="text-2xl md:text-3xl font-medium text-even-evergreen">
                  {t("waitingMessage")}
                </h3>
                <p className="mt-2 text-tone-500 text-base md:text-lg">{t("waitingHint")}</p>
                {error && <p className="mt-4 text-sm text-danger-600">{t("loadError")}</p>}
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="mt-8 flex items-center gap-2 bg-even-grass hover:bg-even-grass/80 text-even-evergreen px-6 md:px-8 py-2 md:py-3 rounded-full transition-colors text-base md:text-lg cursor-pointer disabled:opacity-70"
                >
                  <RefreshCw className={`size-4 md:size-5 ${refreshing ? "animate-spin" : ""}`} />
                  {t("refreshCta")}
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 pb-56">
                  <div className="flex justify-center mt-6 md:mt-8">
                    <h3 className="bg-surface border border-stroke rounded-full px-3 md:px-4 py-1 text-base md:text-lg font-medium text-black">
                      {t("itemsTitle")}
                    </h3>
                  </div>
                  <div className="text-black font-medium text-sm md:text-base flex gap-10 justify-end translate-y-4">
                    <span>{tc("qtyLabel")}</span>
                    <span>{tc("priceLabel")}</span>
                  </div>
                  <div className="divide-y divide-stroke/50">
                    {order.items.map((dish) => (
                      <div key={dish.id} className="py-3 md:py-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 md:gap-4 min-w-0">
                          {showImages && (
                            <div className="shrink-0 size-16 md:size-20 bg-tone-300 rounded-sm flex items-center justify-center">
                              {dish.images?.[0] ? (
                                <img
                                  src={dish.images[0]}
                                  alt={dish.item}
                                  className="w-full h-full object-cover rounded-sm"
                                />
                              ) : (
                                <img
                                  src="/even/even-asterisk-evergreen.svg"
                                  alt=""
                                  className="size-10 object-contain"
                                />
                              )}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-base md:text-lg text-black capitalize">{dish.item}</h4>
                            <ItemCustomizations
                              customFields={dish.custom_fields}
                              note={dish.special_instructions}
                              onlyPaid={true}
                            />
                          </div>
                        </div>
                        <div className="text-right flex gap-10 shrink-0">
                          <p className="text-black text-base md:text-lg">{dish.quantity}</p>
                          <p className="text-black w-16 md:w-20 text-base md:text-lg">
                            ${dishTotal(dish).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className="fixed bottom-0 left-0 right-0 bg-white mx-4 md:mx-6 lg:mx-8 px-6 md:px-8 lg:px-10 pt-6 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
                  style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
                >
                  {order.en_cobro && (
                    <p className="mb-3 text-sm text-center text-tone-600">{t("inPaymentNotice")}</p>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-black font-bold text-base md:text-lg">{t("totalLabel")}</span>
                    <span className="text-black font-bold text-base md:text-lg">
                      ${Number(order.total_amount).toFixed(2)} MXN
                    </span>
                  </div>
                  <button
                    onClick={handleContinue}
                    disabled={order.en_cobro || authLoading}
                    className={`mt-5 w-full py-3 md:py-4 rounded-full active:scale-95 transition-all text-even-evergreen text-base md:text-lg bg-even-grass ${
                      order.en_cobro || authLoading
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer animate-pulse-button"
                    }`}
                  >
                    {t("payCta")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

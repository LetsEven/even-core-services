"use client";

import { PaymentResult } from "@even/ui";
import { useTranslations } from "next-intl";
import { useRestaurant } from "../../context/RestaurantContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { useAuth } from "@/app/context/AuthContext";
import { DishOrder } from "@/app/types/order";

interface OrderAnimationProps {
  userName?: string;
  orderedItems?: DishOrder[];
  // Null/undefined mientras el pago todavía no se confirma de verdad contra
  // el backend: el check y la navegación esperan a esto.
  orderId?: string | null;
  onContinue?: () => void;
  /** Cobra el pago: se llama cuando termina el círculo inicial (no hay ventana de cancelar). */
  onConfirm?: () => void;
  // Red de seguridad si la confirmación real nunca llega.
  onTimeout?: () => void;
}

/**
 * Pantalla de pago procesado de Tap & Pay: la animación vive en `PaymentResult` (@even/ui);
 * aquí solo se arma el resumen (restaurante, usuario y platillos pagados). Sin ventana de cancelar.
 */
const OrderAnimation = ({ userName, orderedItems, orderId, onContinue, onConfirm, onTimeout }: OrderAnimationProps) => {
  const t = useTranslations("OrderAnimation");
  const tc = useTranslations("Common");
  const { navigateWithTable } = useTableNavigation();
  const { restaurant } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;
  const { profile } = useAuth();

  const displayName = userName || profile?.firstName || tc("defaultUserName");
  const displayItems = orderedItems || [];
  const displayRestaurant = restaurant?.name || t("restaurantLabel");
  const userImage = profile?.photoUrl;
  const hasUserImage = !!userImage;

  return (
    <PaymentResult
      confirmed={!!orderId}
      title={t("processingPaymentMessage")}
      successMessage={t("successMessage")}
      timing={{ cancelWindowMs: 0 }}
      onConfirm={onConfirm}
      onTimeout={onTimeout}
      onContinue={() => (onContinue ? onContinue() : navigateWithTable("/order"))}
    >
    {/* Información del pedido */}
    <div className="flex flex-col w-full divide-y divide-stroke/50">
      {/* Restaurante */}
      <div className="pb-4 md:pb-6 lg:pb-7">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="size-10 md:size-12 lg:size-14 rounded-full border border-tone-400 bg-tone-100 overflow-hidden shrink-0">
            <img
              src={
                restaurant?.logo_url ||
                "/even/even-asterisk-evergreen.svg"
              }
              alt={displayRestaurant}
              className="object-cover w-full h-full"
            />
          </div>
          <div>
            <span className="text-black text-base md:text-lg lg:text-xl font-medium">
              {displayRestaurant}
            </span>
            <p className="text-xs md:text-sm lg:text-base text-tone-500">
              {t("restaurantLabel")}
            </p>
          </div>
        </div>
      </div>

      {/* Usuario */}
      <div className="py-4 md:py-6 lg:py-7">
        <div className="flex items-center gap-3 md:gap-4">
          {hasUserImage ? (
            <img
              src={userImage}
              alt={displayName}
              className="size-10 md:size-12 lg:size-14 rounded-full object-cover border border-tone-400 shrink-0"
            />
          ) : (
            <div className="size-10 md:size-12 lg:size-14 rounded-full border border-tone-400 bg-even-evergreen flex items-center justify-center shrink-0">
              <span className="text-white text-base md:text-lg lg:text-xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <span className="text-black text-base md:text-lg lg:text-xl font-medium">
              {displayName}
            </span>
            <p className="text-xs md:text-sm lg:text-base text-tone-500">
              {t("nameFieldLabel")}
            </p>
          </div>
        </div>
      </div>

      {/* Platillos ordenados */}
      {displayItems.length > 0 && (
        <div className="pt-4 md:pt-6 lg:pt-7">
          <p className="text-xs md:text-sm lg:text-base text-tone-500 mb-3 md:mb-4">
            {t("paidDishesLabel")}
          </p>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            {displayItems.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="flex items-center gap-3 md:gap-4"
              >
                {showImages && (
                  <div className="size-10 md:size-12 lg:size-14 bg-tone-300 rounded-sm md:rounded-md flex items-center justify-center overflow-hidden shrink-0">
                    {item.images[0] ? (
                      <img
                        src={item.images[0]}
                        alt={item.item}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src="/even/even-asterisk-evergreen.svg"
                        alt="Even"
                        className="size-6 md:size-8 lg:size-10 object-contain"
                      />
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-black text-sm md:text-base lg:text-lg capitalize">
                    {item.item}
                  </p>
                  <p className="text-xs md:text-sm lg:text-base text-tone-500">
                    {t("quantityLabel", { quantity: item.quantity })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-black text-sm md:text-base lg:text-lg font-medium">
                    $
                    {(
                      (item.price + (item.extra_price || 0)) *
                      item.quantity
                    ).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </PaymentResult>
  );
};

export default OrderAnimation;

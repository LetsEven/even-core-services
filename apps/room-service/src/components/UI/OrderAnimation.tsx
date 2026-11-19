"use client";

import { PaymentResult } from "@even/ui";
import { useTranslations } from "next-intl";
import { CartItem } from "../../context/CartContext";
import { useRestaurant } from "../../context/RestaurantContext";
import { useRoomNavigation } from "@/hooks/useRoomNavigation";
import Loader from "@/components/UI/Loader";
import { useAuth } from "@/context/AuthContext";

interface OrderAnimationProps {
  userName?: string;
  orderedItems?: CartItem[];
  // Null/undefined mientras el pago+orden todavía no se confirman de verdad
  // contra el backend: el check y la navegación esperan a esto.
  orderId?: string | null;
  onContinue?: () => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  // Red de seguridad si la confirmación real nunca llega.
  onTimeout?: () => void;
}

/**
 * Pantalla de pedido creado de Room Service: la animación vive en `PaymentResult` (@even/ui);
 * aquí solo se arma el resumen del pedido (restaurante, usuario y platillos).
 */
const OrderAnimation = ({
  userName,
  orderedItems,
  orderId,
  onContinue,
  onCancel,
  onConfirm,
  onTimeout,
}: OrderAnimationProps) => {
  const t = useTranslations("OrderAnimation");
  const tc = useTranslations("Common");
  const { navigateWithRoom } = useRoomNavigation();
  const { restaurant, loading } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;
  const { profile } = useAuth();

  const displayName = userName || profile?.firstName || tc("defaultUserName");
  const displayItems = orderedItems || [];
  const displayRestaurant = restaurant?.name || t("restaurantLabel");
  const userImage = profile?.photoUrl;
  const hasUserImage = !!userImage;

  if (loading) return <Loader />;

  return (
    <PaymentResult
      confirmed={!!orderId}
      title={t("creatingOrder")}
      successMessage={t("successMessage")}
      cancelLabel={t("undoOrderCta")}
      onConfirm={onConfirm}
      onCancel={onCancel}
      onTimeout={onTimeout}
      onContinue={() => (onContinue ? onContinue() : navigateWithRoom("/order"))}
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
            {t("orderedDishesLabel")}
          </p>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            {displayItems.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="flex items-center gap-3 md:gap-4"
              >
                {showImages && (
                  <div className="size-10 md:size-12 lg:size-14 bg-tone-300 rounded-sm md:rounded-md flex items-center justify-center overflow-hidden shrink-0">
                    {item.images && item.images[0] ? (
                      <img
                        src={item.images[0]}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src="/even/even-asterisk-evergreen.svg"
                        alt="Logo Even"
                        className="size-6 md:size-8 lg:size-10 object-contain"
                      />
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-black text-sm md:text-base lg:text-lg capitalize">
                    {item.name}
                  </p>
                  <p className="text-xs md:text-sm lg:text-base text-tone-500">
                    {t("quantityLabel", { quantity: item.quantity })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-black text-sm md:text-base lg:text-lg font-medium">
                    $
                    {(
                      (item.price + (item.extraPrice || 0)) *
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

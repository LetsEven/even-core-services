"use client";

import { useOrderAnimation } from "@even/ui/diner";
import { useTranslations } from "next-intl";
import { CartItem } from "../../context/CartContext";
import { useRestaurant } from "../../context/RestaurantContext";
import { useParams, useRouter } from "next/navigation";
import Loader from "@/components/UI/Loader";
import { useAuth } from "@/context/AuthContext";

interface OrderAnimationProps {
  userName?: string;
  orderedItems?: CartItem[];
  // Null/undefined mientras el pago+orden todavía no se confirman de verdad
  // contra el backend — la pantalla de éxito y la navegación esperan a esto
  // en vez de un tiempo fijo, para no desincronizarse de un pago lento.
  orderId?: string | null;
  onContinue?: () => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  // Se dispara si la confirmación real nunca llega dentro de un tiempo
  // razonable (red de seguridad) — así la pantalla nunca se queda congelada
  // esperando para siempre.
  onTimeout?: () => void;
}

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
  const router = useRouter();
  const params = useParams();
  const restaurantId = params?.restaurantId as string;
  const { restaurant, loading } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;
  const { user, profile } = useAuth();

  const displayName = userName || profile?.firstName || tc("defaultUserName");
  const displayItems = orderedItems || [];
  const displayRestaurant = restaurant?.name || t("restaurantLabel");

  const userImage = profile?.photoUrl;
  const hasUserImage = !!userImage;

  const { animationState, logoColorful, showCancelButton, handleContinue } =
    useOrderAnimation({
      confirmed: !!orderId,
      onConfirm,
      onContinue,
      onTimeout,
      fallbackContinue: () => router.push(`/${restaurantId}/order-tracking`),
      lockBody: true,
    });

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  // Mostrar loader mientras carga
  if (loading) {
    return <Loader />;
  }

  return (
    <>
      {/* White circle */}
      {animationState === "circle" && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none overflow-hidden">
          <div className="circle-animation"></div>
        </div>
      )}

      {/* Contenido */}
      {(animationState === "content" || animationState === "greenCircle") && (
        <div className="fixed inset-0 z-[9999] bg-white overflow-hidden">
          <div className="min-h-dvh bg-white p-8 animate-fade-in flex flex-col overflow-y-auto">
            <div className="flex flex-col flex-1">
              {/* Logo animado */}
              <div className="mb-6 md:mb-8 lg:mb-10 mt-8 md:mt-12 lg:mt-14 w-fit relative">
                {/* Pulsing rings */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="pulse-ring"></div>
                  <div className="pulse-ring pulse-ring-delay-1"></div>
                  <div className="pulse-ring pulse-ring-delay-2"></div>
                </div>
                {/* Logo container */}
                <div className="size-20 md:size-24 lg:size-28 flex items-center justify-center rounded-full relative z-10">
                  <img
                    src="/even/even-asterisk-evergreen.svg"
                    alt="Even Logo"
                    className="size-14 md:size-16 lg:size-20 grayscale opacity-50"
                  />
                </div>
              </div>

              {/* Título */}
              <div className="text-black text-3xl md:text-5xl lg:text-6xl font-medium mb-8 md:mb-12 lg:mb-14 mr-12 md:mr-20 lg:mr-24">
                {t("creatingOrder")}
              </div>

              {/* Información del pedido */}
              <div className="flex flex-col w-full divide-y divide-stroke/50">
                {/* Restaurante */}
                <div className="pb-4 md:pb-6 lg:pb-7">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="size-10 md:size-12 lg:size-14 rounded-full border border-tone-400 bg-tone-100 overflow-hidden flex-shrink-0">
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
                        className="size-10 md:size-12 lg:size-14 rounded-full object-cover border border-tone-400 flex-shrink-0"
                      />
                    ) : (
                      <div className="size-10 md:size-12 lg:size-14 rounded-full border border-tone-400 bg-even-evergreen flex items-center justify-center flex-shrink-0">
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
                            <div className="size-10 md:size-12 lg:size-14 bg-tone-300 rounded-sm md:rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
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

              {/* Botón de cancelar */}
              {onCancel && (
                <div
                  className={`mt-auto pt-6 md:pt-8 pb-4 md:pb-6 transition-opacity duration-500 ${
                    showCancelButton
                      ? "opacity-100"
                      : "opacity-0 pointer-events-none"
                  }`}
                >
                  <button
                    onClick={handleCancel}
                    className="py-1 md:py-1.5 px-6 md:px-8 text-black rounded-full active:scale-95 transition-all font-medium text-sm md:text-base bg-surface lg:py-2 border border-stroke/40 cursor-pointer"
                  >
                    {t("undoOrderCta")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animacion circulo verde */}
      {animationState === "greenCircle" && (
        <div className="fixed inset-0 z-[10000] overflow-hidden pointer-events-none">
          <div className="p-6 md:p-8 lg:p-10">
            <div className="mb-6 md:mb-8 lg:mb-10 mt-8 md:mt-12 lg:mt-14 relative">
              <div className="green-circle-from-logo"></div>
            </div>
          </div>
        </div>
      )}

      {/* Success screen */}
      {animationState === "success" && (
        <div className="fixed inset-0 z-[9999] bg-even-grass overflow-hidden">
          <div className="h-[100dvh] p-8 flex flex-col">
            <div className="flex flex-col flex-1">
              {/* Checkmark */}
              <div className="mb-6 md:mb-8 lg:mb-10 mt-8 md:mt-12 lg:mt-14 animate-simple-fade-in">
                <div className="size-20 md:size-24 lg:size-28 rounded-full bg-white flex items-center justify-center">
                  <svg
                    className="size-14 md:size-16 lg:size-20 text-even-evergreen"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
              </div>

              {/* Success message */}
              <div className="text-even-evergreen text-3xl md:text-5xl lg:text-6xl font-medium mb-8 md:mb-12 lg:mb-14 mr-16 md:mr-28 lg:mr-32 animate-simple-fade-in">
                {t("successMessage")}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OrderAnimation;

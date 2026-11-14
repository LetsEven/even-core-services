"use client";

import { useParams } from "next/navigation";
import { useRestaurant } from "@/context/RestaurantContext";
import { peekDishImage } from "@/lib/dish-transition";
import DishHeroImage from "@/components/DishHeroImage";
import DishBottomBar from "@/components/UI/DishBottomBar";
import MenuHeaderDish from "@/components/headers/MenuHeaderDish";

/**
 * Esqueleto del detalle de producto: misma estructura que la página (foto, botón
 * de volver, hoja blanca y barra inferior) para que al cargar solo cambie el contenido.
 * El botón de volver ya funciona desde aquí.
 */
export default function DishSkeleton({ className = "" }: { className?: string }) {
  const { restaurant } = useRestaurant();
  const { id } = useParams<{ id?: string }>();
  const sharedSrc = id ? peekDishImage(id) : null;
  const showImages = sharedSrc || !restaurant || restaurant.menu_show_images !== false;
  const bar = "rounded-md bg-tone-200";

  return (
    <div className={`h-dvh bg-white relative overflow-hidden ${className}`}>
      {showImages && (
        <div className="absolute top-0 left-0 w-full h-96 md:h-[28rem] lg:h-[32rem] z-0">
          {/* ready: el esqueleto ya está en pantalla, la foto en vuelo puede retirarse */}
          <DishHeroImage
            src={sharedSrc}
            ready
            className={`absolute inset-0 ${sharedSrc ? "" : "animate-pulse bg-tone-200"}`}
          />
        </div>
      )}

      <div className="relative z-90">
        <MenuHeaderDish />
      </div>

      <main className={`${showImages ? "mt-64 md:mt-80 lg:mt-96" : "mt-2 md:mt-4"} relative z-10`}>
        <div
          aria-busy="true"
          className="rounded-t-4xl bg-white px-6 pt-8 md:px-8 md:pt-10 lg:px-10 lg:pt-12"
        >
          <div className="animate-pulse">
          <div className="mb-6 flex items-center justify-between md:mb-7">
            <div className={`${bar} h-6 w-24`} />
            <div className={`${bar} h-5 w-36`} />
          </div>
          <div className={`${bar} h-9 w-2/3`} />
          <div className={`${bar} mt-3 h-6 w-24`} />
          <div className="mt-6 space-y-2">
            <div className={`${bar} h-4 w-full`} />
            <div className={`${bar} h-4 w-5/6`} />
          </div>
          <div className="mt-10 flex items-center justify-between">
            <div className={`${bar} h-7 w-28`} />
            <div className={`${bar} h-7 w-24 rounded-full`} />
          </div>
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between rounded-xl border border-tone-200 p-4">
                <div className={`${bar} h-5 w-1/3`} />
                <div className="size-5 rounded-full bg-tone-200" />
              </div>
            ))}
          </div>
          </div>
        </div>
      </main>

      <DishBottomBar loading />
    </div>
  );
}

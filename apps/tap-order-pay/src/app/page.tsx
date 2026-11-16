"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import TableSpotPicker from "@/components/TableSpotPicker";

// Restaurant ID y Branch por defecto para testing
const DEFAULT_RESTAURANT_ID = 15;
const DEFAULT_BRANCH_NUMBER = 1;

export default function Home() {
  const t = useTranslations("HomePage");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();
  const [showPicker, setShowPicker] = useState(false);

  const restaurantParam = searchParams.get("restaurant");
  const pickerRestaurantId =
    restaurantParam || DEFAULT_RESTAURANT_ID;
  const branchNumber = searchParams.get("branch") || DEFAULT_BRANCH_NUMBER;

  useEffect(() => {
    if (isLoading) return;

    // Check if user just signed in/up and has context
    const storedTable = sessionStorage.getItem("pendingTableRedirect");
    const storedRestaurant = sessionStorage.getItem("pendingRestaurantId");
    const authFromPaymentFlow = sessionStorage.getItem("authFromPaymentFlow");
    const authFromMenu = sessionStorage.getItem("authFromMenu");

    // Determinar restaurantId
    const restaurantId =
      restaurantParam || storedRestaurant || DEFAULT_RESTAURANT_ID;

    if (isAuthenticated && storedTable) {
      // User signed in/up from cart (CartView), redirect to order-confirm
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      router.replace(
        `/${restaurantId}/${DEFAULT_BRANCH_NUMBER}/order-confirm?table=${storedTable}`,
      );
      return;
    }

    if (isAuthenticated && storedTable && authFromMenu) {
      // User signed in from MenuView settings, redirect to dashboard with table
      sessionStorage.removeItem("authFromMenu");
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("pendingRestaurantId");
      router.replace(
        `/${restaurantId}/${DEFAULT_BRANCH_NUMBER}/dashboard?table=${storedTable}`,
      );
      return;
    }

    if (isAuthenticated && storedTable && authFromPaymentFlow) {
      // User signed up during payment flow, redirect to order-confirm
      sessionStorage.removeItem("pendingTableRedirect");
      sessionStorage.removeItem("authFromPaymentFlow");
      sessionStorage.removeItem("pendingRestaurantId");
      router.replace(
        `/${restaurantId}/${DEFAULT_BRANCH_NUMBER}/order-confirm?table=${storedTable}`,
      );
      return;
    }

    // Check for table parameter in current URL
    const tableParam = searchParams.get("table");
    if (tableParam) {
      router.replace(
        `/${restaurantId}/${branchNumber}/menu?table=${tableParam}`,
      );
      return;
    }

    // Sin mesa: se muestra el selector de mesas
    setShowPicker(true);
  }, [router, searchParams, isAuthenticated, isLoading, branchNumber]);

  if (showPicker) {
    return (
      <TableSpotPicker
        restaurantId={pickerRestaurantId}
        onSelect={(table) =>
          router.push(
            `/${pickerRestaurantId}/${branchNumber}/menu?table=${encodeURIComponent(table)}`,
          )
        }
      />
    );
  }

  return (
    <div className="min-h-new brand-evergreen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 md:py-10 lg:py-12">
        <div className="w-full max-w-md flex flex-col items-center text-center">
          {/* Wordmark — identificador primario de marca */}
          <img
            src="/brand/even-wordmark-grass.svg"
            alt="even"
            className="w-44 md:w-52 lg:w-60 h-auto mb-10 md:mb-12 lg:mb-14"
          />

          <h1 className="text-even-offwhite text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight mb-4 md:mb-5">
            {t("heroTitle")}
          </h1>

          <p className="text-even-offwhite/85 text-sm md:text-base lg:text-lg leading-relaxed max-w-sm">
            {t.rich("heroSubtitle", {
              highlight: (chunks) => (
                <span className="even-highlight">{chunks}</span>
              ),
            })}
          </p>

          <p className="mt-8 md:mt-10 text-even-offwhite/55 text-xs md:text-sm lg:text-base leading-relaxed max-w-xs">
            {t("heroFootnote")}
          </p>
        </div>
      </div>
    </div>
  );
}

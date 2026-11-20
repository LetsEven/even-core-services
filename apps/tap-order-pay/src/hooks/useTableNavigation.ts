"use client";

import { useServiceNavigation } from "@even/ui/diner";
import { useRestaurant } from "../context/RestaurantContext";

export function useTableNavigation() {
  const { restaurantId, branchNumber } = useRestaurant();
  const nav = useServiceNavigation({ param: "table", restaurantId, branchNumber });

  return {
    tableNumber: nav.location,
    restaurantId: nav.restaurantId,
    branchNumber: nav.branchNumber,
    navigateWithTable: nav.navigateWithLocation,
    goBack: nav.goBack,
    getUrlWithTable: nav.getUrlWithLocation,
    hasTable: nav.hasLocation,
    hasRestaurant: nav.hasRestaurant,
    hasBranch: nav.hasBranch,
  };
}

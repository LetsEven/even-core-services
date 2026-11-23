"use client";

import { useServiceNavigation } from "@even/ui/diner";
import { useRestaurant } from "../context/RestaurantContext";

export function useRoomNavigation() {
  const { restaurantId, branchNumber } = useRestaurant();
  const nav = useServiceNavigation({ param: "room", restaurantId, branchNumber });

  return {
    roomNumber: nav.location,
    restaurantId: nav.restaurantId,
    branchNumber: nav.branchNumber,
    navigateWithRoom: nav.navigateWithLocation,
    goBack: nav.goBack,
    getUrlWithRoom: nav.getUrlWithLocation,
    hasRoom: nav.hasLocation,
    hasRestaurant: nav.hasRestaurant,
    hasBranch: nav.hasBranch,
  };
}

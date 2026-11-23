"use client";

import type { ReactNode } from "react";
import { PepperProvider as SharedPepperProvider, usePepper } from "@even/ui/diner";
import { useRestaurant } from "./RestaurantContext";

export { usePepper };

/** Conversación con Pepper (en `@even/ui/diner`); se reinicia al cambiar de restaurante. */
export function PepperProvider({ children }: { children: ReactNode }) {
  const { restaurantId } = useRestaurant();
  return <SharedPepperProvider resetKey={restaurantId}>{children}</SharedPepperProvider>;
}

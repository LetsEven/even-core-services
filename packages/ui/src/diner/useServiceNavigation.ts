"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type ServiceNavigationOptions = {
  /** Parámetro de la URL que identifica el lugar: `table` (mesa) o `room` (habitación). */
  param: "table" | "room";
  /** Del contexto del restaurante: se usan si la ruta no trae `restaurantId`/`branchNumber`. */
  restaurantId?: string | number | null;
  branchNumber?: string | number | null;
};

/**
 * Navegación que conserva el contexto de servicio en la URL (`/{restaurantId}/{branchNumber}/{path}?{param}=…`).
 * Era `useTableNavigation` (TOP) / `useRoomNavigation` (RS): idénticos salvo el nombre del parámetro.
 */
export function useServiceNavigation({ param, restaurantId, branchNumber }: ServiceNavigationOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();

  const location = searchParams?.get(param);

  // Obtener restaurantId y branchNumber de params o del contexto
  const currentRestaurantId = params?.restaurantId || restaurantId;
  const currentBranchNumber = params?.branchNumber || branchNumber;

  // Función para navegar manteniendo el parámetro del lugar, restaurantId y branchNumber
  const navigateWithLocation = useCallback(
    (path: string, replace: boolean = false) => {
      if (!location) {
        console.warn(`No ${param} number found in URL, navigating without ${param} context`);
        if (replace) {
          router.replace(path);
        } else {
          router.push(path);
        }
        return;
      }

      if (!currentRestaurantId || !currentBranchNumber) {
        console.warn("No restaurant ID or branch number found, navigating without full context");
        const separator = path.includes("?") ? "&" : "?";
        const newUrl = `${path}${separator}${param}=${location}`;

        if (replace) {
          router.replace(newUrl);
        } else {
          router.push(newUrl);
        }
        return;
      }

      // Construir la URL con restaurantId, branchNumber y el lugar
      // Si el path ya incluye la estructura completa, no agregarlo
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/${currentBranchNumber}/`)) {
        // Remover el primer slash si existe
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${currentBranchNumber}/${cleanPath}`;
      }

      // Verificar si ya existe un query string en el path
      const separator = fullPath.includes("?") ? "&" : "?";
      const newUrl = `${fullPath}${separator}${param}=${location}`;

      if (replace) {
        router.replace(newUrl);
      } else {
        router.push(newUrl);
      }
    },
    [router, location, param, currentRestaurantId, currentBranchNumber],
  );

  // Función para ir hacia atrás manteniendo el contexto del lugar
  const goBack = useCallback(() => {
    if (!location || !currentRestaurantId || !currentBranchNumber) {
      router.back();
      return;
    }

    // En lugar de router.back(), navegar a la página principal del menú
    navigateWithLocation("/menu");
  }, [router, location, currentRestaurantId, currentBranchNumber, navigateWithLocation]);

  // Función para obtener URL completa con restaurantId, branchNumber y el parámetro del lugar
  const getUrlWithLocation = useCallback(
    (path: string) => {
      if (!location || !currentRestaurantId || !currentBranchNumber) {
        return path;
      }

      // Construir la URL con restaurantId y branchNumber
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/${currentBranchNumber}/`)) {
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${currentBranchNumber}/${cleanPath}`;
      }

      return `${fullPath}?${param}=${location}`;
    },
    [location, param, currentRestaurantId, currentBranchNumber],
  );

  return {
    location,
    restaurantId: currentRestaurantId,
    branchNumber: currentBranchNumber,
    navigateWithLocation,
    goBack,
    getUrlWithLocation,
    hasLocation: !!location,
    hasRestaurant: !!currentRestaurantId,
    hasBranch: !!currentBranchNumber,
  };
}

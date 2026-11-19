"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useFlowNavigation } from "@even/ui/diner";
import { useCallback } from "react";
import { useRestaurant } from "../context/RestaurantContext";

/**
 * Hook de navegación para Pick & Go
 * Maneja navegación con restaurantId y branchNumber (query param)
 */
export function useNavigation() {
  const router = useRouter();
  const flow = useFlowNavigation();
  const params = useParams();
  const searchParams = useSearchParams();
  const { restaurantId } = useRestaurant();

  // Obtener restaurantId de params o del contexto
  const currentRestaurantId = params?.restaurantId || restaurantId;

  // Obtener branchNumber actual de los query params
  const currentBranchNumber = searchParams.get("branch");

  /**
   * Navegar manteniendo el contexto del restaurante y branch
   * @param path - Ruta a navegar (ej: "/menu", "/cart", "/dish/123")
   * @param options - Opciones de navegación
   */
  // Arma la URL con restaurantId y branch (query param) según lo que se conozca.
  const buildUrl = useCallback(
    (
      path: string,
      options?: {
        branchNumber?: number | string | null;
        preserveBranch?: boolean;
      }
    ) => {
      const { branchNumber, preserveBranch = true } = options || {};

      if (!currentRestaurantId) {
        console.warn(
          "No restaurant ID found, navigating without restaurant context"
        );
        return path;
      }

      // Construir la URL completa con restaurantId
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/`)) {
        // Remover el primer slash si existe para evitar dobles slashes
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${cleanPath}`;
      }

      // Agregar branchNumber como query param si está disponible
      const finalBranchNumber = branchNumber !== undefined ? branchNumber : (preserveBranch ? currentBranchNumber : null);

      if (finalBranchNumber) {
        const separator = fullPath.includes("?") ? "&" : "?";
        fullPath = `${fullPath}${separator}branch=${finalBranchNumber}`;
      }

      return fullPath;
    },
    [currentRestaurantId, currentBranchNumber]
  );

  /**
   * Navegar manteniendo el contexto del restaurante y branch. Entre pasos del flujo de compra la navegación
   * lleva la animación de tarjeta.
   * @param path - Ruta a navegar (ej: "/menu", "/cart", "/dish/123")
   * @param options - Opciones de navegación
   */
  const navigateWithRestaurantId = useCallback(
    (
      path: string,
      options?: {
        replace?: boolean;
        branchNumber?: number | string | null;
        preserveBranch?: boolean;
      }
    ) => {
      const url = buildUrl(path, options);
      if (options?.replace) {
        flow.replace(url);
      } else {
        flow.push(url);
      }
    },
    [buildUrl, flow]
  );

  /**
   * Volver a la vista anterior (con animación si ambas son del flujo). Sin historial previo (entró directo a la
   * vista) navega a `fallbackPath`, con el contexto del restaurante.
   */
  const back = useCallback(
    (fallbackPath?: string) => {
      flow.back(fallbackPath ? buildUrl(fallbackPath) : undefined);
    },
    [flow, buildUrl]
  );

  /**
   * Navegar a la página de detalle de un producto
   * @param dishId - ID del producto
   * @param replace - Si usar replace en lugar de push (default: false)
   */
  const navigateToDish = useCallback(
    (dishId: string | number, replace: boolean = false) => {
      navigateWithRestaurantId(`/dish/${dishId}`, { replace });
    },
    [navigateWithRestaurantId]
  );

  // Prefetch de la ruta del platillo para que la navegación sea inmediata
  const prefetchDish = useCallback(
    (dishId: string | number) => {
      if (!currentRestaurantId) return;
      const query = currentBranchNumber ? `?branch=${currentBranchNumber}` : "";
      router.prefetch(`/${currentRestaurantId}/dish/${dishId}${query}`);
    },
    [router, currentRestaurantId, currentBranchNumber]
  );

  /**
   * Navegar hacia atrás con contexto: a la vista anterior, o al menú principal si no hay historial
   */
  const goBack = useCallback(() => back("/menu"), [back]);

  /**
   * Construir URL completa con restaurantId sin navegar
   * @param path - Ruta relativa
   * @returns URL completa con restaurantId
   */
  const getUrlWithRestaurantId = useCallback(
    (path: string) => {
      if (!currentRestaurantId) {
        return path;
      }

      // Construir la URL con restaurantId
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/`)) {
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${cleanPath}`;
      }

      return fullPath;
    },
    [currentRestaurantId]
  );

  /**
   * Navegar al carrito del restaurante
   */
  const navigateToCart = useCallback(() => {
    navigateWithRestaurantId("/cart");
  }, [navigateWithRestaurantId]);

  /**
   * Navegar al menú del restaurante
   */
  const navigateToMenu = useCallback(() => {
    navigateWithRestaurantId("/menu");
  }, [navigateWithRestaurantId]);

  /**
   * Navegar a la página de confirmación de pedido
   */
  const navigateToOrderConfirmation = useCallback(() => {
    navigateWithRestaurantId("/order-confirmation");
  }, [navigateWithRestaurantId]);

  /**
   * Cambiar de sucursal (actualiza el query param en la URL actual)
   */
  const changeBranch = useCallback(
    (branchNumber: number | null) => {
      if (typeof window === "undefined") return;

      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const searchParams = new URLSearchParams(currentSearch);

      if (branchNumber) {
        searchParams.set("branch", branchNumber.toString());
      } else {
        searchParams.delete("branch");
      }

      const newSearch = searchParams.toString();
      const newUrl = newSearch ? `${currentPath}?${newSearch}` : currentPath;

      router.push(newUrl);
    },
    [router]
  );

  return {
    // Estado
    restaurantId: currentRestaurantId,
    hasRestaurant: !!currentRestaurantId,
    branchNumber: currentBranchNumber ? parseInt(currentBranchNumber) : null,

    // Navegación general
    navigateWithRestaurantId,
    goBack,
    back,
    getUrlWithRestaurantId,
    changeBranch,

    // Navegación específica para Pick & Go
    navigateToDish,
    prefetchDish,
    navigateToCart,
    navigateToMenu,
    navigateToOrderConfirmation,
  };
}

// Re-export para compatibilidad (opcional, si queremos mantener el nombre)
export { useNavigation as usePickAndGoNavigation };
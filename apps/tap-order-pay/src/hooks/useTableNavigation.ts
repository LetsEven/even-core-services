"use client";

import { useSearchParams, useParams } from "next/navigation";
import { useCallback } from "react";
import { useFlowNavigation } from "@even/ui/diner";
import { useRestaurant } from "../context/RestaurantContext";

export function useTableNavigation() {
  const flow = useFlowNavigation();
  const searchParams = useSearchParams();
  const params = useParams();
  const { restaurantId, branchNumber } = useRestaurant();

  const tableNumber = searchParams?.get("table");

  // Obtener restaurantId y branchNumber de params o del contexto
  const currentRestaurantId = params?.restaurantId || restaurantId;
  const currentBranchNumber = params?.branchNumber || branchNumber;

  // Arma la URL con restaurantId, branchNumber y table (según lo que se conozca).
  const buildUrl = useCallback(
    (path: string) => {
      if (!tableNumber) {
        console.warn(
          "No table number found in URL, navigating without table context"
        );
        return path;
      }

      if (!currentRestaurantId || !currentBranchNumber) {
        console.warn(
          "No restaurant ID or branch number found, navigating without full context"
        );
        return `${path}${path.includes("?") ? "&" : "?"}table=${tableNumber}`;
      }

      // Si el path ya incluye la estructura completa, no agregarlo
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/${currentBranchNumber}/`)) {
        // Remover el primer slash si existe
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${currentBranchNumber}/${cleanPath}`;
      }

      // Verificar si ya existe un query string en el path
      return `${fullPath}${fullPath.includes("?") ? "&" : "?"}table=${tableNumber}`;
    },
    [tableNumber, currentRestaurantId, currentBranchNumber]
  );

  // Función para navegar manteniendo el parámetro table, restaurantId y branchNumber.
  // Entre pasos del flujo de compra la navegación lleva la animación de tarjeta.
  const navigateWithTable = useCallback(
    (path: string, replace: boolean = false) => {
      const newUrl = buildUrl(path);
      if (replace) {
        flow.replace(newUrl);
      } else {
        flow.push(newUrl);
      }
    },
    [buildUrl, flow]
  );

  // Volver a la vista anterior (con animación si ambas son del flujo). Sin historial previo (entró directo a la
  // vista) navega a `fallbackPath`, con el contexto de mesa.
  const back = useCallback(
    (fallbackPath?: string) => {
      flow.back(fallbackPath ? buildUrl(fallbackPath) : undefined);
    },
    [flow, buildUrl]
  );

  // Volver con el menú de la mesa como respaldo.
  const goBack = useCallback(() => back("/menu"), [back]);

  // Función para obtener URL completa con restaurantId, branchNumber y table parameter
  const getUrlWithTable = useCallback(
    (path: string) => {
      if (!tableNumber || !currentRestaurantId || !currentBranchNumber) {
        return path;
      }

      // Construir la URL con restaurantId y branchNumber
      let fullPath = path;
      if (!path.startsWith(`/${currentRestaurantId}/${currentBranchNumber}/`)) {
        const cleanPath = path.startsWith("/") ? path.slice(1) : path;
        fullPath = `/${currentRestaurantId}/${currentBranchNumber}/${cleanPath}`;
      }

      return `${fullPath}?table=${tableNumber}`;
    },
    [tableNumber, currentRestaurantId, currentBranchNumber]
  );

  return {
    tableNumber,
    restaurantId: currentRestaurantId,
    branchNumber: currentBranchNumber,
    navigateWithTable,
    goBack,
    back,
    getUrlWithTable,
    hasTable: !!tableNumber,
    hasRestaurant: !!currentRestaurantId,
    hasBranch: !!currentBranchNumber,
  };
}

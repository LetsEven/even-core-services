"use client";

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

// Navega dentro de /{restaurantId}/{branchNumber}: en Retail la sucursal es todo el contexto
export function useBranchNavigation() {
  const router = useRouter();
  const params = useParams();
  const restaurantId = params?.restaurantId as string | undefined;
  const branchNumber = params?.branchNumber as string | undefined;

  const pathFor = useCallback(
    (path: string) => {
      const clean = path.replace(/^\//, "");
      const base = `/${restaurantId}/${branchNumber}`;
      return clean ? `${base}/${clean}` : base;
    },
    [restaurantId, branchNumber],
  );

  const navigate = useCallback(
    (path: string, replace = false) => {
      const url = pathFor(path);
      if (replace) router.replace(url);
      else router.push(url);
    },
    [router, pathFor],
  );

  return { restaurantId, branchNumber, navigate, pathFor };
}

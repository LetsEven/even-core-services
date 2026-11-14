"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { Branch, BranchContextType } from "@/types/branch.types";
import { branchService } from "@/services/branch.service";
import { loadResource, peekResource, prefetchResource } from "@even/api-client";

type BranchesResponse = Awaited<ReturnType<typeof branchService.getBranches>>;

// Las sucursales casi no cambian: se conservan 5 min y se comparten entre pasos.
const BRANCHES_TTL_MS = 5 * 60_000;
const branchesKey = (restaurantId: number) => `branches:${restaurantId}`;
const loadBranches = (restaurantId: number) =>
  branchService.getBranches(restaurantId).then((response) => {
    // No guardar en caché una respuesta fallida.
    if (!response.success || !response.data) throw new Error("branches unavailable");
    return response;
  });

/** Precarga las sucursales (p. ej. desde el carrito, antes de la confirmación). */
export function prefetchBranches(restaurantId: number) {
  prefetchResource(branchesKey(restaurantId), () => loadBranches(restaurantId), {
    ttlMs: BRANCHES_TTL_MS,
  });
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [selectedBranchNumber, setSelectedBranchNumber] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [branchInitialized, setBranchInitialized] = useState(false);

  // Sincronizar selectedBranchNumber con el query param de la URL
  useEffect(() => {
    const branchNumberFromUrl = searchParams.get("branch");
    if (branchNumberFromUrl) {
      const branchNum = parseInt(branchNumberFromUrl);
      if (!isNaN(branchNum) && branchNum !== selectedBranchNumber) {
        setSelectedBranchNumber(branchNum);
      }
    }
  }, [searchParams]);

  const fetchBranches = useCallback(async (restaurantId: number) => {
    const applyBranches = (response: BranchesResponse) => {
      if (!response.success || !response.data) return;
      setBranches(response.data);

      // Obtener branch de la URL
      const branchNumberFromUrl = searchParams.get("branch");

      // Si hay branch en la URL, usarlo
      if (branchNumberFromUrl) {
        const branchNum = parseInt(branchNumberFromUrl);
        if (!isNaN(branchNum)) {
          setSelectedBranchNumber(branchNum);
        }
      } else if (response.data.length > 0) {
        // Si no hay branch en la URL, seleccionar la primera sucursal por defecto
        setSelectedBranchNumber((current) => current ?? response.data![0].branch_number);
      }
    };

    // Con sucursales ya cargadas se pintan al instante; se revalidan solo si vencieron.
    const cached = peekResource<BranchesResponse>(branchesKey(restaurantId));
    if (cached) {
      applyBranches(cached);
      setBranchInitialized(true);
    } else {
      setIsLoading(true);
    }
    try {
      applyBranches(
        await loadResource(branchesKey(restaurantId), () => loadBranches(restaurantId), {
          ttlMs: BRANCHES_TTL_MS,
        }),
      );
    } catch (error) {
      console.error("Error fetching branches:", error);
    } finally {
      setIsLoading(false);
      setBranchInitialized(true);
    }
  }, [searchParams]);

  return (
    <BranchContext.Provider
      value={{
        selectedBranchNumber,
        branches,
        isLoading,
        branchInitialized,
        setSelectedBranchNumber,
        fetchBranches,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (context === undefined) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return context;
}

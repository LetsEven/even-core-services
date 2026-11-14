"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { prefetchResource } from "@even/api-client";
import {
  CLAIMED_DISCOUNT_TTL_MS,
  claimedOrderDiscountKey,
  claimedPromoKey,
  fetchClaimedOrderDiscount,
  fetchClaimedPromoDiscount,
} from "@even/cart/react";
import { useAuth } from "@/context/AuthContext";
import { useBranch, prefetchBranches } from "@/context/BranchContext";
import { promoActivationsService } from "@/services/promoActivations.service";
import { userDiscountsService } from "@/services/userDiscounts.service";
import { prefetchAgentStatus } from "./useAgentStatus";
import { prefetchMsiConfig } from "./useMsiConfig";
import { prefetchPaymentProvider } from "./usePaymentProvider";

type NextStep = "order-confirm" | "card-selection";

/**
 * Calienta lo que necesitan los pasos siguientes del flujo de compra
 * (código de la ruta + datos baratos: sucursales, proveedor de pago, estado
 * del POS, MSI y descuentos ya reclamados) para que al avanzar se pinten al
 * instante en vez de mostrar esqueletos. Se llama desde el carrito y desde la
 * confirmación; las peticiones se comparten con las de cada paso vía caché.
 */
export function useCheckoutPrefetch(steps: NextStep[]) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { selectedBranchNumber } = useBranch();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const restaurantId = params?.restaurantId as string | undefined;
  const urlBranch = searchParams.get("branch");
  const stepsKey = steps.join(",");

  useEffect(() => {
    if (!restaurantId || isNaN(parseInt(restaurantId))) return;
    const query = urlBranch ? `?branch=${urlBranch}` : "";
    for (const step of stepsKey.split(",")) {
      router.prefetch(`/${restaurantId}/${step}${query}`);
    }
    prefetchBranches(Number(restaurantId));
  }, [router, restaurantId, urlBranch, stepsKey]);

  useEffect(() => {
    if (!restaurantId || isNaN(parseInt(restaurantId))) return;
    if (!stepsKey.split(",").includes("card-selection")) return;
    const rid = Number(restaurantId);
    prefetchPaymentProvider(rid);
    prefetchMsiConfig();
    // Mismas sucursales que usa la pantalla de pago para sus consultas.
    prefetchAgentStatus(rid, selectedBranchNumber ?? 1);
    if (authLoading) return;
    if (isAuthenticated) {
      prefetchResource(
        claimedOrderDiscountKey(user?.id, rid),
        () => fetchClaimedOrderDiscount(userDiscountsService, rid),
        { ttlMs: CLAIMED_DISCOUNT_TTL_MS },
      );
    }
    const discountBranch =
      selectedBranchNumber || (urlBranch ? parseInt(urlBranch) : null);
    if (discountBranch) {
      prefetchResource(
        claimedPromoKey(user?.id, rid, discountBranch),
        () =>
          fetchClaimedPromoDiscount(promoActivationsService, rid, discountBranch),
        { ttlMs: CLAIMED_DISCOUNT_TTL_MS },
      );
    }
  }, [
    restaurantId,
    stepsKey,
    selectedBranchNumber,
    urlBranch,
    authLoading,
    isAuthenticated,
    user?.id,
  ]);
}

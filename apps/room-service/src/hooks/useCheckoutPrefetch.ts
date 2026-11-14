"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { prefetchResource } from "@even/api-client";
import {
  CLAIMED_DISCOUNT_TTL_MS,
  claimedOrderDiscountKey,
  claimedPromoKey,
  fetchClaimedOrderDiscount,
  fetchClaimedPromoDiscount,
} from "@even/cart/react";
import { useAuth } from "@/context/AuthContext";
import { promoActivationsService } from "@/services/promoActivations.service";
import { userDiscountsService } from "@/services/userDiscounts.service";
import { prefetchAgentStatus } from "./useAgentStatus";
import { prefetchMsiConfig } from "./useMsiConfig";

type NextStep = "order-confirm" | "card-selection";

/**
 * Calienta lo que necesitan los pasos siguientes del flujo de compra
 * (código de la ruta + estado del POS, MSI y descuentos ya reclamados) para
 * que al avanzar se pinten al instante en vez de mostrar esqueletos. Se llama
 * desde el carrito y desde la confirmación; las peticiones se comparten con
 * las de cada paso vía caché.
 */
export function useCheckoutPrefetch(steps: NextStep[]) {
  const router = useRouter();
  const params = useParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const restaurantId = params?.restaurantId as string | undefined;
  const branchNumber = params?.branchNumber as string | undefined;
  const stepsKey = steps.join(",");

  useEffect(() => {
    if (!restaurantId || !branchNumber) return;
    for (const step of stepsKey.split(",")) {
      router.prefetch(`/${restaurantId}/${branchNumber}/${step}`);
    }
  }, [router, restaurantId, branchNumber, stepsKey]);

  useEffect(() => {
    if (!restaurantId || !branchNumber) return;
    if (!stepsKey.split(",").includes("card-selection")) return;
    const rid = Number(restaurantId);
    const branch = Number(branchNumber);
    if (isNaN(rid) || isNaN(branch)) return;
    prefetchMsiConfig();
    prefetchAgentStatus(restaurantId, branch);
    if (authLoading) return;
    if (isAuthenticated) {
      prefetchResource(
        claimedOrderDiscountKey(user?.id, rid),
        () => fetchClaimedOrderDiscount(userDiscountsService, rid),
        { ttlMs: CLAIMED_DISCOUNT_TTL_MS },
      );
    }
    prefetchResource(
      claimedPromoKey(user?.id, rid, branch),
      () => fetchClaimedPromoDiscount(promoActivationsService, rid, branch),
      { ttlMs: CLAIMED_DISCOUNT_TTL_MS },
    );
  }, [restaurantId, branchNumber, stepsKey, authLoading, isAuthenticated, user?.id]);
}

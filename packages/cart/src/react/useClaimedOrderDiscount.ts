import { useCachedResource } from "./useCachedResource";
import type { UserDiscount, UserDiscountsService } from "../userDiscounts";
import type { UseAuth } from "./types";

// Descuento personal "% en la cuenta" ya reclamado por este usuario para
// este restaurante (TK-0078). El checkout lo usa para descontar el base
// ANTES de calcular comisiones/total, y manda su id en processPayment —
// el backend valida y consume el único uso al cobrar (y lo revierte si el
// cobro no se concreta).
export interface ClaimedOrderDiscountDeps {
  userDiscountsService: Pick<UserDiscountsService, "getActive">;
  useAuth: UseAuth;
}

// Corto: el descuento se usa para calcular el total, así que se revalida en
// cuanto vence; mientras tanto el paso se pinta al instante con el valor previo.
export const CLAIMED_DISCOUNT_TTL_MS = 20_000;

export function claimedOrderDiscountKey(
  userId: string | number | null | undefined,
  restaurantId: number,
) {
  return `discount:claimed-user:${userId ?? "anon"}:${restaurantId}`;
}

export function fetchClaimedOrderDiscount(
  userDiscountsService: Pick<UserDiscountsService, "getActive">,
  restaurantId: number,
): Promise<UserDiscount | null> {
  return userDiscountsService.getActive(restaurantId).then((response) => {
    const list = response.success && response.data ? response.data : [];
    return (
      list.find((d) => d.discount_type === "order" && d.status === "claimed") ??
      null
    );
  });
}

export function createUseClaimedOrderDiscount({
  userDiscountsService,
  useAuth,
}: ClaimedOrderDiscountDeps) {
  return function useClaimedOrderDiscount(restaurantId: number | null) {
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();
    const key =
      restaurantId && isAuthenticated
        ? claimedOrderDiscountKey(user?.id, restaurantId)
        : null;
    const { data, loading } = useCachedResource<UserDiscount | null>(
      key,
      () => fetchClaimedOrderDiscount(userDiscountsService, Number(restaurantId)),
      { ttlMs: CLAIMED_DISCOUNT_TTL_MS },
    );
    return { discount: data ?? null, loading: authLoading || loading };
  };
}

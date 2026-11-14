import type { PromoActivationsService } from "../promoActivations";
import type { UseAuth, UseClaimedOrderDiscount } from "./types";
import { CLAIMED_DISCOUNT_TTL_MS } from "./useClaimedOrderDiscount";
import { useCachedResource } from "./useCachedResource";

// Unifica las DOS fuentes posibles de "% en la cuenta" en el checkout:
// el descuento personal (user_discounts, TK-0078) y la promo QR de cuenta
// (promo_activations vía QR exclusivo). Prioridad: personal primero — si
// el cliente tiene ambos reclamados a la vez, solo se aplica uno (nunca se
// mandan los dos ids juntos a confirmOrder, el backend lo rechazaría).
export interface AccountDiscount {
  source: "personal" | "promo";
  id: string;
  discountPercentage: number;
}

export interface AccountDiscountDeps {
  promoActivationsService: Pick<
    PromoActivationsService,
    "getClaimedOrderDiscount"
  >;
  useClaimedOrderDiscount: UseClaimedOrderDiscount;
  /** Para identificar al usuario en la clave del caché (descuentos son por usuario). */
  useAuth: UseAuth;
}

export function claimedPromoKey(
  userId: string | number | null | undefined,
  restaurantId: number,
  branchNumber: number,
) {
  return `discount:claimed-promo:${userId ?? "anon"}:${restaurantId}:${branchNumber}`;
}

export function fetchClaimedPromoDiscount(
  promoActivationsService: AccountDiscountDeps["promoActivationsService"],
  restaurantId: number,
  branchNumber: number,
): Promise<AccountDiscount | null> {
  return promoActivationsService
    .getClaimedOrderDiscount(restaurantId, branchNumber)
    .then((response) => {
      const claimed = response.success && response.data ? response.data : null;
      return claimed
        ? {
            source: "promo" as const,
            id: claimed.redemptionId,
            discountPercentage: claimed.discountPercentage,
          }
        : null;
    });
}

export function createUseAccountDiscount({
  promoActivationsService,
  useClaimedOrderDiscount,
  useAuth,
}: AccountDiscountDeps) {
  return function useAccountDiscount(
    restaurantId: number | null,
    branchNumber: number | null,
  ): { accountDiscount: AccountDiscount | null; loading: boolean } {
    const { discount: personal, loading: personalLoading } =
      useClaimedOrderDiscount(restaurantId);
    const { user } = useAuth();
    const promoKey =
      restaurantId && branchNumber
        ? claimedPromoKey(user?.id, restaurantId, branchNumber)
        : null;
    const { data: promo, loading: promoResourceLoading } = useCachedResource<
      AccountDiscount | null
    >(
      promoKey,
      () =>
        fetchClaimedPromoDiscount(
          promoActivationsService,
          Number(restaurantId),
          Number(branchNumber),
        ),
      { ttlMs: CLAIMED_DISCOUNT_TTL_MS },
    );

    if (personal) {
      return {
        accountDiscount: {
          source: "personal",
          id: personal.id,
          discountPercentage: personal.discount_percentage,
        },
        loading: false,
      };
    }

    return {
      accountDiscount: promo ?? null,
      loading: personalLoading || promoResourceLoading,
    };
  };
}

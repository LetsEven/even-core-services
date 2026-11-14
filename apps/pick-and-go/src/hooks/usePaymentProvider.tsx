import { getBackendOrigin, prefetchResource } from "@even/api-client";
import { useCachedResource } from "@even/cart/react";

const API_BASE_URL = getBackendOrigin(
  process.env.NEXT_PUBLIC_API_URL,
  "http://localhost:5000",
);

export type PaymentProviderCode = "ecartpay" | "clip" | null;

// El proveedor casi nunca cambia: se conserva 10 min en memoria.
const PROVIDER_TTL_MS = 10 * 60_000;
const providerKey = (restaurantId: string | number) =>
  `payment-provider:${restaurantId}`;

async function fetchProvider(
  restaurantId: string | number,
): Promise<PaymentProviderCode> {
  const res = await fetch(
    `${API_BASE_URL}/api/payment-providers/resolve/${restaurantId}`,
  );
  if (!res.ok) throw new Error("Failed to fetch payment provider");
  const data = await res.json();
  return (data.provider as PaymentProviderCode) ?? null;
}

/** Precarga el proveedor de pago (p. ej. desde el carrito). */
export function prefetchPaymentProvider(restaurantId: string | number | null) {
  if (!restaurantId) return;
  prefetchResource(
    providerKey(restaurantId),
    () => fetchProvider(restaurantId),
    { ttlMs: PROVIDER_TTL_MS },
  );
}

export function usePaymentProvider(restaurantId: string | number | null) {
  const { data, loading } = useCachedResource<PaymentProviderCode>(
    restaurantId ? providerKey(restaurantId) : null,
    () => fetchProvider(restaurantId as string | number),
    { ttlMs: PROVIDER_TTL_MS },
  );
  return { provider: data ?? null, isLoadingProvider: loading };
}

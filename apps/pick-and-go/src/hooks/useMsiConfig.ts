"use client";

import { prefetchResource } from "@even/api-client";
import { useCachedResource } from "@even/cart/react";
import { paymentService } from "@/services/payment.service";
import type { MsiConfig } from "@/types/payment.types";

const EMPTY_CONFIG: MsiConfig = { isActive: false, visaMc: [], amex: [] };
const MSI_KEY = "msi-config";
const MSI_TTL_MS = 5 * 60_000;

async function fetchMsiConfig(): Promise<MsiConfig> {
  const result = await paymentService.getMsiConfiguration();
  // No guardar en caché una respuesta fallida: se reintenta en la próxima lectura.
  if (!result.success || !result.data) throw new Error("MSI config unavailable");
  return result.data;
}

/** Precarga la configuración de MSI (p. ej. desde el carrito). */
export function prefetchMsiConfig() {
  prefetchResource(MSI_KEY, fetchMsiConfig, { ttlMs: MSI_TTL_MS });
}

export function useMsiConfig() {
  // Si falla la red se queda EMPTY_CONFIG y la sección de MSI no se muestra.
  const { data, loading } = useCachedResource<MsiConfig>(
    MSI_KEY,
    fetchMsiConfig,
    { ttlMs: MSI_TTL_MS },
  );
  return { msiConfig: data ?? EMPTY_CONFIG, isMsiLoading: loading };
}

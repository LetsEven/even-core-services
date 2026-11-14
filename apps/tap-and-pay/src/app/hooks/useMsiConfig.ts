"use client";

import { useState, useEffect } from "react";
import { loadResource, peekResource, prefetchResource } from "@even/api-client";
import { paymentService, type MsiConfig } from "@/app/services/payment.service";

const EMPTY_CONFIG: MsiConfig = { isActive: false, visaMc: [], amex: [] };
const MSI_KEY = "msi-config";
const MSI_TTL_MS = 5 * 60_000;

async function fetchMsiConfig(): Promise<MsiConfig> {
  const result = await paymentService.getMsiConfiguration();
  // No guardar en caché una respuesta fallida: se reintenta en la próxima lectura.
  if (!result.success || !result.data) throw new Error("MSI config unavailable");
  return result.data;
}

/** Precarga la configuración de MSI (p. ej. desde la propina). */
export function prefetchMsiConfig() {
  prefetchResource(MSI_KEY, fetchMsiConfig, { ttlMs: MSI_TTL_MS });
}

export function useMsiConfig() {
  // Con valor en caché se pinta al instante; si falla la red queda EMPTY_CONFIG
  // y la sección de MSI no se muestra.
  const [msiConfig, setMsiConfig] = useState<MsiConfig>(
    () => peekResource<MsiConfig>(MSI_KEY) ?? EMPTY_CONFIG,
  );
  const [isMsiLoading, setIsMsiLoading] = useState(
    () => peekResource<MsiConfig>(MSI_KEY) === undefined,
  );

  useEffect(() => {
    let cancelled = false;
    loadResource(MSI_KEY, fetchMsiConfig, { ttlMs: MSI_TTL_MS })
      .then((data) => {
        if (!cancelled) setMsiConfig(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsMsiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { msiConfig, isMsiLoading };
}

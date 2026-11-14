import { useEffect, useState } from "react";
import {
  DEFAULT_TTL_MS,
  isResourceFresh,
  loadResource,
  peekResource,
} from "@even/api-client";

/**
 * Lee un recurso del caché compartido (stale-while-revalidate): si ya hay un
 * valor —aunque esté vencido— se devuelve en el primer render y `loading` es
 * false; si está vencido se revalida en segundo plano. Solo hay `loading`
 * cuando no hay nada que mostrar todavía.
 * `key` null = deshabilitado (loading false, data undefined).
 */
export function useCachedResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: { ttlMs?: number } = {},
): { data: T | undefined; loading: boolean; error: boolean } {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const [, setVersion] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const cached = key ? peekResource<T>(key) : undefined;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    if (isResourceFresh(key, ttlMs)) return;
    loadResource(key, fetcher, { ttlMs })
      .then(() => {
        if (!cancelled) setVersion((v) => v + 1);
      })
      .catch(() => {
        if (!cancelled) setFailed(key);
      });
    return () => {
      cancelled = true;
    };
    // `fetcher` cambia de identidad en cada render; la clave ya lo identifica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttlMs]);

  const error = key !== null && failed === key && cached === undefined;
  return {
    data: cached,
    loading: key !== null && cached === undefined && !error,
    error,
  };
}

/**
 * Caché en memoria de datos baratos del flujo de compra (proveedor de pago,
 * estado del POS, MSI, descuentos, sucursales...). Sirve para:
 *  - que un paso ya visitado se pinte al instante al volver (sin esqueleto);
 *  - precargar el siguiente paso desde el carrito (`prefetch`);
 *  - no repetir la misma petición si ya hay una en vuelo (se comparte la promesa).
 * Los errores nunca se guardan. Vive solo en la pestaña (se pierde al recargar).
 */

interface Entry {
  value: unknown;
  at: number;
}

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export const DEFAULT_TTL_MS = 60_000;

/** Valor guardado (aunque esté vencido) o undefined. */
export function peekResource<T>(key: string): T | undefined {
  return entries.get(key)?.value as T | undefined;
}

export function hasResource(key: string): boolean {
  return entries.has(key);
}

/** ¿Hay valor y aún no vence? */
export function isResourceFresh(key: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const entry = entries.get(key);
  return !!entry && Date.now() - entry.at < ttlMs;
}

/**
 * Devuelve el valor fresco del caché o ejecuta `fetcher` (compartiendo la
 * petición si ya hay una en vuelo para la misma clave).
 */
export function loadResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttlMs?: number; force?: boolean } = {},
): Promise<T> {
  const { ttlMs = DEFAULT_TTL_MS, force = false } = options;
  if (!force && isResourceFresh(key, ttlMs)) {
    return Promise.resolve(entries.get(key)!.value as T);
  }
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const request = fetcher()
    .then((value) => {
      entries.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === request) inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}

/** Precarga en segundo plano: nunca lanza. */
export function prefetchResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttlMs?: number },
): void {
  loadResource(key, fetcher, options).catch(() => {});
}

/** Borra las claves que empiezan con `prefix` (o todo sin argumento). */
export function invalidateResources(prefix = ""): void {
  for (const key of [...entries.keys()]) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

export type SpotStatus = "available" | "occupied" | "reserved" | "unknown";

export interface Spot {
  /** Número o nombre tal como se usa en `?table=`. */
  id: string;
  status: SpotStatus;
}

interface RawTable {
  table_number?: string | number | null;
  status?: string | null;
}

const KNOWN: readonly SpotStatus[] = ["available", "occupied", "reserved"];

function toStatus(raw: string | null | undefined): SpotStatus {
  const value = (raw ?? "").toLowerCase();
  return (KNOWN as readonly string[]).includes(value)
    ? (value as SpotStatus)
    : "unknown";
}

/** Orden natural: 2 antes que 10, y "A1" junto a "A2". */
const collator = new Intl.Collator(undefined, { numeric: true });

/**
 * Lista las mesas de un restaurante con su estatus
 * (`GET /restaurants/:id/tables`, público).
 *
 * El endpoint filtra por restaurante, no por sucursal: en restaurantes con
 * varias sucursales las mesas se mezclan. Si el número se repite se conserva
 * la primera aparición.
 */
export async function fetchRestaurantTables(
  baseUrl: string | undefined,
  restaurantId: string | number,
  options: { signal?: AbortSignal; fetch?: typeof fetch } = {},
): Promise<Spot[]> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const res = await doFetch(`${baseUrl}/restaurants/${restaurantId}/tables`, {
    signal: options.signal,
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`tables_request_failed_${res.status}`);

  const body = (await res.json()) as { success?: boolean; data?: RawTable[] };
  if (!body.success || !Array.isArray(body.data)) {
    throw new Error("tables_response_invalid");
  }

  const seen = new Map<string, Spot>();
  for (const row of body.data) {
    if (row.table_number == null || row.table_number === "") continue;
    const id = String(row.table_number);
    if (!seen.has(id)) seen.set(id, { id, status: toStatus(row.status) });
  }
  return [...seen.values()].sort((a, b) => collator.compare(a.id, b.id));
}

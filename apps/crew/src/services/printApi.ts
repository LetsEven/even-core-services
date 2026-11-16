const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// El endpoint de reimpresión aún no existe en el backend: la acción queda
// detrás de VITE_ENABLE_REPRINT=true.
export function isReprintEnabled(
  flag: string | undefined = import.meta.env.VITE_ENABLE_REPRINT,
): boolean {
  return flag === "true";
}

export function reprintPath(orderType: string, orderId: string): string {
  return `/api/kitchen/orders/${encodeURIComponent(orderType)}/${encodeURIComponent(orderId)}/reprint`;
}

export function reprintErrorMessage(status?: number): string {
  if (status === 404)
    return "La reimpresión aún no está disponible en el servidor.";
  if (status === 401 || status === 403)
    return "No tienes permiso para reimprimir esta comanda.";
  return "No se pudo reimprimir la comanda. Revisa la impresora e inténtalo de nuevo.";
}

export class ReprintError extends Error {
  status?: number;
  constructor(status?: number) {
    super(reprintErrorMessage(status));
    this.status = status;
  }
}

export async function reprintComanda(
  orderType: string,
  orderId: string,
  token: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${reprintPath(orderType, orderId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ReprintError();
  }
  if (!res.ok) throw new ReprintError(res.status);
}

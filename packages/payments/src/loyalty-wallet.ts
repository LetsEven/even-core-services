import type { Requester } from "@even/api-client";

/**
 * La tarjeta de lealtad en Apple/Google Wallet.
 *
 * ## Quién decide si el botón aparece
 *
 * El backend, no la app. `disponibilidad` responde 200 SIEMPRE, con un
 * motivo cuando la respuesta es que no. Así el frontend no tiene que saber
 * nada de programas, estados ni proveedores: pregunta y obedece.
 *
 * Los motivos importan porque no se tratan igual: `ya_tiene` significa que
 * no hay nada que ofrecer y no vale la pena volver a preguntar;
 * `sin_programa` puede cambiar mañana si el dueño activa su programa.
 *
 * ## Por qué el proveedor lo manda el cliente
 *
 * Porque sólo el teléfono sabe qué es. El backend no lo adivina por
 * user-agent a propósito: equivocarse ahí entrega una tarjeta que no se
 * puede guardar, y un iPhone puede abrir la liga desde un navegador que
 * miente sobre sí mismo.
 */

export type MotivoSinTarjeta = "sin_proveedor" | "sin_programa" | "ya_tiene";

export interface DisponibilidadDeTarjeta {
  puede: boolean;
  motivo?: MotivoSinTarjeta;
  proveedores?: Array<"google" | "apple">;
  programa?: { name: string };
}

export interface TarjetaEmitida {
  passInstanceId: string;
  /**
   * Para Google es la liga firmada de "Guardar en Google Wallet"; para
   * Apple, la ruta del `.pkpass`. En los dos casos basta con abrirla.
   */
  saveUrl: string;
  programa?: { name: string };
}

/**
 * iOS detectado por el único camino que queda: el iPad moderno se declara
 * Mac, así que se le reconoce por tener pantalla táctil.
 */
export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * ⚠️ Las rutas NO llevan `/api`: `NEXT_PUBLIC_API_URL` ya termina en
 * `/api`. Ponerlo otra vez produce `/api/api/...`, que responde 404 — y como
 * un fallo consultando se traga a propósito para no molestar al comensal, el
 * botón simplemente no aparece: sin error, sin rastro.
 */
export function createWalletCardService(requestWithAuth: Requester) {
  return {
    async disponibilidad(
      restaurantId: number,
    ): Promise<DisponibilidadDeTarjeta | null> {
      const res = await requestWithAuth<DisponibilidadDeTarjeta>(
        `/loyalty/wallet/disponibilidad?restaurant_id=${restaurantId}`,
        { method: "GET" },
      );
      return res.success ? (res.data ?? null) : null;
    },

    async emitir(restaurantId: number): Promise<TarjetaEmitida> {
      const res = await requestWithAuth<TarjetaEmitida>("/loyalty/wallet/pase", {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId,
          provider: esIOS() ? "apple" : "google",
        }),
      });

      if (!res.success || !res.data) {
        // El backend escribe sus mensajes para que los lea el comensal, así
        // que se respetan en vez de inventar uno genérico. `code` permite
        // distinguir "regístrate" de "ya la tienes".
        const err = new Error(res.message || "No se pudo crear tu tarjeta");
        (err as Error & { code?: string }).code = res.code || res.error?.code;
        throw err;
      }

      return res.data;
    },
  };
}

export type WalletCardService = ReturnType<typeof createWalletCardService>;

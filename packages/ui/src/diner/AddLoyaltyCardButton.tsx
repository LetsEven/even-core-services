"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "../components/button";
import {
  esIOS,
  type DisponibilidadDeTarjeta,
  type WalletCardService,
} from "@even/payments";

/**
 * "Agregar tarjeta de lealtad" en la pantalla de cobro.
 *
 * ## No decide nada
 *
 * Si se pinta o no lo dice el backend (`disponibilidad`), que a su vez
 * depende de que el dueño tenga su programa ACTIVO en el admin portal.
 * Pausarlo o terminarlo hace desaparecer el botón sin tocar las apps.
 * Por eso aquí no hay ninguna condición sobre programas ni proveedores.
 *
 * ## Mientras no sabe, no ocupa lugar
 *
 * Devuelve `null` durante la consulta en vez de un esqueleto: aparecer y
 * desaparecer movería los botones de abajo justo cuando el comensal está
 * por tocar "Ver ticket".
 *
 * ## El invitado SÍ lo ve
 *
 * Es el anzuelo al registro, y es una decisión de producto, no un
 * descuido. Al tocarlo recibe un 403 con `requiere_cuenta` y se le explica
 * por qué; esa pantalla ya sabe llevarlo a registrarse.
 */
export default function AddLoyaltyCardButton({
  restaurantId,
  walletCardService,
}: {
  restaurantId: number | null | undefined;
  walletCardService: WalletCardService;
}) {
  const t = useTranslations("LoyaltyCard");

  const [disponible, setDisponible] = useState<DisponibilidadDeTarjeta | null>(
    null,
  );
  const [emitiendo, setEmitiendo] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    let vivo = true;

    walletCardService
      .disponibilidad(restaurantId)
      .then((d) => {
        if (vivo) setDisponible(d);
      })
      // Un fallo consultando no es algo que el comensal deba ver: lo único
      // que pasa es que no se le ofrece la tarjeta en este cobro.
      .catch(() => {});

    return () => {
      vivo = false;
    };
  }, [restaurantId, walletCardService]);

  const agregar = useCallback(async () => {
    if (!restaurantId) return;
    setError(null);
    setEmitiendo(true);

    try {
      const { saveUrl } = await walletCardService.emitir(restaurantId);

      // Un `window.open` aquí lo come el bloqueador de ventanas emergentes
      // de iOS, porque para entonces el clic ya no es "reciente". Navegar
      // en la misma pestaña funciona en los dos sistemas: Google abre su
      // pantalla de guardado y Safari ofrece "Agregar a Wallet".
      setListo(true);
      window.location.href = saveUrl;
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      setError(
        code === "requiere_cuenta"
          ? t("needsAccount")
          : (e as Error).message || t("failed"),
      );
    } finally {
      setEmitiendo(false);
    }
  }, [restaurantId, walletCardService, t]);

  if (!disponible?.puede) return null;

  return (
    <div className="w-full">
      {/* Se pinta sobre pantallas Evergreen (ticket, estado del pedido): botón claro, ancho completo. */}
      <Button
        variant="light"
        fullWidth
        onClick={agregar}
        disabled={emitiendo || listo}
        loading={emitiendo}
        className="gap-[clamp(0.5rem,2vw,0.75rem)] py-[clamp(0.625rem,1.8vh,1rem)] text-[length:clamp(0.875rem,2.4vw,1.125rem)]"
      >
        {!emitiendo && <Wallet className="size-[1.25em]" strokeWidth={1.6} />}
        {emitiendo
          ? t("adding")
          : esIOS()
            ? t("ctaApple")
            : t("ctaGoogle")}
      </Button>

      {error && (
        <p className="mt-2 text-center text-sm text-white">{error}</p>
      )}
    </div>
  );
}

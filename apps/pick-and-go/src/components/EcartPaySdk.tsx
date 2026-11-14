"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

/**
 * Carga el SDK de eCart Pay. Sobre HTTP en un dispositivo con Apple Pay (p. ej.
 * iPhone en desarrollo) el SDK lanza "InvalidAccessError: Trying to start an
 * Apple Pay session from an insecure document", así que ahí no se carga: las
 * billeteras no pueden funcionar de todos modos y se paga con tarjeta guardada.
 */
export default function EcartPaySdk() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const insecure = window.location.protocol !== "https:";
    const appleDevice =
      "ApplePaySession" in window || /iPad|iPhone|iPod/.test(navigator.userAgent);
    setAllowed(!(insecure && appleDevice));
  }, []);
  if (!allowed) return null;
  return <Script src="https://pay.ecart.com/sdk/pay.js" strategy="afterInteractive" />;
}

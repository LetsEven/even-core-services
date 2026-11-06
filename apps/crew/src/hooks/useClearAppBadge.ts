import { useEffect } from "react";

// Al abrir o volver a crew las órdenes ya están en pantalla: limpia el contador del ícono y las notificaciones
export function useClearAppBadge(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const clear = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
        const registration = await navigator.serviceWorker?.getRegistration();
        const shown = (await registration?.getNotifications()) ?? [];
        shown.forEach((n) => n.close());
      } catch {
        /* Badging API o getNotifications no soportados */
      }
    };

    clear();
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, [enabled]);
}

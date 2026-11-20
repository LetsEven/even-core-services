"use client";

import { useEffect, useRef, useState } from "react";

export type OrderAnimationState = "circle" | "content" | "greenCircle" | "success";

export interface UseOrderAnimationOptions {
  /**
   * True cuando el pago/orden ya se confirmó de verdad contra el backend: la pantalla de éxito y la
   * navegación esperan a esto en vez de un tiempo fijo, para no desincronizarse de un pago lento.
   */
  confirmed: boolean;
  /** Se llama una vez que expira el tiempo de cancelación (dispara el cobro/creación real de la orden). */
  onConfirm?: () => void;
  /** Navegación al terminar la animación. Si no se da, se usa `fallbackContinue`. */
  onContinue?: () => void;
  /** Se dispara si la confirmación nunca llega dentro de un tiempo razonable (red de seguridad). */
  onTimeout?: () => void;
  /** Destino por defecto al terminar (o al agotarse el tiempo sin `onTimeout`). */
  fallbackContinue: () => void;
  /** Bloquea el scroll del body (position fixed) mientras dura la animación. Por defecto, no. */
  lockBody?: boolean;
}

/**
 * Coreografía de la pantalla "creando tu orden": circle -> content -> greenCircle -> success, el
 * bloqueo de recarga y la red de seguridad por tiempo. La presentación (JSX, textos, imágenes) es
 * de cada app; aquí solo vive el estado y los tiempos.
 */
export function useOrderAnimation({
  confirmed,
  onConfirm,
  onContinue,
  onTimeout,
  fallbackContinue,
  lockBody = false,
}: UseOrderAnimationOptions) {
  // Siempre apuntan a la versión más reciente de los callbacks para evitar closures obsoletos
  // dentro de los timers de abajo (se programan una sola vez).
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const onContinueRef = useRef(onContinue);
  useEffect(() => {
    onContinueRef.current = onContinue;
  }, [onContinue]);

  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const fallbackRef = useRef(fallbackContinue);
  useEffect(() => {
    fallbackRef.current = fallbackContinue;
  }, [fallbackContinue]);

  const [animationState, setAnimationState] = useState<OrderAnimationState>("circle");
  const [logoColorful, setLogoColorful] = useState(false);
  const [showCancelButton, setShowCancelButton] = useState(true);

  useEffect(() => {
    if (!lockBody) return;
    const prev = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      width: document.body.style.width,
      height: document.body.style.height,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.width = prev.width;
      document.body.style.height = prev.height;
    };
  }, [lockBody]);

  // Prevenir recarga de página durante la animación
  useEffect(() => {
    // Bloquear atajos de teclado (F5, Ctrl+R, Cmd+R)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5" || (e.ctrlKey && e.key === "r") || (e.metaKey && e.key === "r")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Mostrar diálogo de confirmación al intentar recargar/cerrar
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    // Prevenir pull-to-refresh en Safari/iOS
    const handleTouchMove = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        e.preventDefault();
      }
    };

    // Aplicar estilos al body para prevenir overscroll
    const originalOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = "none";

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("touchmove", handleTouchMove);
      document.body.style.overscrollBehavior = originalOverscrollBehavior;
    };
  }, []);

  // Coreografía cosmética (circle -> content -> greenCircle): esto solo controla ritmo visual y
  // dispara el cobro real vía onConfirm — no depende de si el pago ya terminó, así que es seguro
  // que corra en tiempos fijos.
  useEffect(() => {
    const contentTimer = setTimeout(() => {
      setAnimationState("content");
    }, 1500);

    const cancelButtonTimer = setTimeout(() => {
      setShowCancelButton(false);
      // Confirmar la orden después de que expire el tiempo de cancelación.
      // Se usa el ref para llamar siempre la versión más reciente (evita closures obsoletos).
      if (onConfirmRef.current) {
        onConfirmRef.current();
      }
    }, 4000);

    const logoTimer = setTimeout(() => {
      setLogoColorful(true);
    }, 3500);

    const greenCircleTimer = setTimeout(() => {
      setAnimationState("greenCircle");
    }, 5500);

    return () => {
      clearTimeout(contentTimer);
      clearTimeout(cancelButtonTimer);
      clearTimeout(logoTimer);
      clearTimeout(greenCircleTimer);
    };
  }, []);

  const handleContinue = () => {
    if (onContinueRef.current) {
      onContinueRef.current();
    } else {
      fallbackRef.current();
    }
  };

  // A partir de "greenCircle" SÍ importa el pago real: se espera a que la orden se confirme de
  // verdad antes de mostrar el check y navegar (antes era un timer fijo y la pantalla se quedaba
  // congelada si el pago tardaba más).
  useEffect(() => {
    if (animationState !== "greenCircle" || !confirmed) return;

    // Dejar que la animación del círculo verde (1.5s) termine de expandirse
    // antes de mostrar el check, para que no se sienta un salto brusco.
    const successTimer = setTimeout(() => {
      setAnimationState("success");
    }, 1500);

    return () => clearTimeout(successTimer);
  }, [animationState, confirmed]);

  useEffect(() => {
    if (animationState !== "success") return;

    // Mantener el check visible un momento antes de navegar.
    const continueTimer = setTimeout(() => {
      handleContinue();
    }, 1800);

    return () => clearTimeout(continueTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleContinue solo lee refs
  }, [animationState]);

  // Red de seguridad: si el pago/orden nunca se confirma (ni éxito ni error) dentro de un tiempo
  // razonable, no dejar al usuario congelado esperando — se avisa y se sale de la animación.
  useEffect(() => {
    if (animationState !== "greenCircle" || confirmed) return;

    const timeoutTimer = setTimeout(() => {
      if (onTimeoutRef.current) {
        onTimeoutRef.current();
      } else {
        handleContinue();
      }
    }, 20000);

    return () => clearTimeout(timeoutTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleContinue solo lee refs
  }, [animationState, confirmed]);

  return { animationState, logoColorful, showCancelButton, handleContinue };
}

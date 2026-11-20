import { useCallback, useEffect, useRef, useState } from "react";
import { clearCachedWalletOrder } from "../wallet-order-cache";

/** El backend suelta el apartado a los 3 min; la app lo da por vencido un poco antes. */
export const WALLET_HOLD_EXPIRY_MS = 170 * 1000;

export interface UseWalletHoldOptions {
  /** Cuenta de la mesa. Sin ella no hay nada que soltar al salir. */
  accountId: string | null | undefined;
  /** Suelta el apartado en el backend (p. ej. `paymentService.releaseWalletHold`). */
  release: (accountId: string) => void;
  /** El apartado venció sin pagar: la app obliga a regresar a la cuenta. */
  onExpired: () => void;
  /** Sustituto del reloj (para tests). */
  now?: () => number;
}

/**
 * Apartado de Apple/Google Pay en una cuenta de mesa. Al crear la orden de
 * wallet el backend aparta ese monto para que nadie más lo pague; el apartado
 * vence a los ~3 min y se suelta al salir de la pantalla sin pagar. En ambos
 * casos la orden de wallet guardada deja de servir y se borra de la caché.
 */
export function useWalletHold({ accountId, release, onExpired, now = Date.now }: UseWalletHoldOptions) {
  const [expired, setExpired] = useState(false);
  const heldAtRef = useRef<number | null>(null);
  const paidRef = useRef(false);
  const optionsRef = useRef({ release, onExpired, now });
  // Va antes que el resto de effects: así ven las opciones de este render.
  useEffect(() => {
    optionsRef.current = { release, onExpired, now };
  });

  const clearWalletOrders = () => {
    clearCachedWalletOrder("apple");
    clearCachedWalletOrder("google");
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const since = heldAtRef.current;
      if (since === null || paidRef.current) return;
      if (optionsRef.current.now() - since > WALLET_HOLD_EXPIRY_MS) {
        clearWalletOrders();
        setExpired(true);
        optionsRef.current.onExpired();
        clearInterval(timer);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    const releaseIfHeld = () => {
      if (heldAtRef.current !== null && !paidRef.current) {
        optionsRef.current.release(accountId);
        // Sin apartado, la orden guardada no debe reusarse al volver
        clearWalletOrders();
      }
    };
    window.addEventListener("pagehide", releaseIfHeld);
    return () => {
      window.removeEventListener("pagehide", releaseIfHeld);
      releaseIfHeld();
    };
  }, [accountId]);

  /** Se creó (o recuperó) la orden de wallet: desde aquí corre el apartado. */
  const markHeld = useCallback(() => {
    if (heldAtRef.current === null) heldAtRef.current = optionsRef.current.now();
  }, []);

  /** El pago con wallet se autorizó: ya no se vence ni se suelta. */
  const markPaid = useCallback(() => {
    paidRef.current = true;
  }, []);

  return { expired, markHeld, markPaid };
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type PaymentResultTiming = {
  /** Cuánto dura el círculo blanco antes de mostrar el contenido. */
  introMs: number;
  /** Ventana (tras mostrar el contenido) en la que se puede cancelar; 0 = confirma de inmediato. */
  cancelWindowMs: number;
  /** Tiempo entre confirmar el cobro y arrancar el círculo verde. */
  settleMs: number;
  /** Duración del círculo verde antes de mostrar el check. */
  greenMs: number;
  /** Cuánto se queda el check antes de continuar. */
  successMs: number;
  /** Si la confirmación real no llega en este tiempo, se llama `onTimeout`. */
  timeoutMs: number;
};

export const DEFAULT_PAYMENT_RESULT_TIMING: PaymentResultTiming = {
  introMs: 1500,
  cancelWindowMs: 2500,
  settleMs: 1500,
  greenMs: 1500,
  successMs: 1800,
  timeoutMs: 20000,
};

export type PaymentResultProps = {
  /** `false` hasta que el backend confirma de verdad el pago/pedido; el check y `onContinue` esperan a esto. */
  confirmed: boolean;
  /** Se llama al terminar la ventana de cancelación: aquí se dispara el cobro real. */
  onConfirm?: () => void;
  /** Si se pasa, aparece el botón de cancelar durante la ventana. */
  onCancel?: () => void;
  /** Cuando termina el check. */
  onContinue: () => void;
  /** La confirmación nunca llegó (red de seguridad). Sin él se llama `onContinue`. */
  onTimeout?: () => void;
  /** Título mientras se procesa. */
  title: ReactNode;
  /** Texto de la pantalla de éxito. */
  successMessage: ReactNode;
  /** Texto del botón de cancelar. */
  cancelLabel?: ReactNode;
  /** Resumen específico del servicio (restaurante, usuario, platillos, mesa, total...). */
  children?: ReactNode;
  /** Logo de la marca (gris mientras procesa). */
  logoSrc?: string;
  /** Tiempos por servicio: `cancelWindowMs: 0` para quitar la ventana de cancelar (cuentas de mesa). */
  timing?: Partial<PaymentResultTiming>;
};

type Phase = "circle" | "content" | "green" | "success";

/**
 * Animación de pago finalizado, común a todas las apps de comensal:
 * círculo blanco → resumen con ventana opcional de cancelar → círculo verde → check → continuar.
 * La coreografía es cosmética; el check y la navegación esperan a `confirmed`.
 */
export function PaymentResult({
  confirmed,
  onConfirm,
  onCancel,
  onContinue,
  onTimeout,
  title,
  successMessage,
  cancelLabel,
  children,
  logoSrc = "/even/even-asterisk-evergreen.svg",
  timing,
}: PaymentResultProps) {
  const t = { ...DEFAULT_PAYMENT_RESULT_TIMING, ...timing };
  const [phase, setPhase] = useState<Phase>("circle");
  const [showCancel, setShowCancel] = useState(true);

  // Siempre la versión más reciente de los callbacks (evita closures obsoletos).
  const onConfirmRef = useRef(onConfirm);
  const onContinueRef = useRef(onContinue);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
    onContinueRef.current = onContinue;
    onTimeoutRef.current = onTimeout;
  });

  // Congela el scroll y evita recargar mientras se confirma el cobro.
  useEffect(() => {
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      width: body.style.width,
      height: body.style.height,
      overscroll: body.style.overscrollBehavior,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.overscrollBehavior = "none";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key === "r")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // Evita el pull-to-refresh de Safari/iOS.
    const onTouchMove = (e: TouchEvent) => {
      if (window.scrollY === 0) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("touchmove", onTouchMove);
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.width = prev.width;
      body.style.height = prev.height;
      body.style.overscrollBehavior = prev.overscroll;
    };
  }, []);

  // Coreografía cosmética: círculo → contenido → (fin de ventana: cobra) → círculo verde.
  useEffect(() => {
    const confirmAt = t.introMs + t.cancelWindowMs;
    const timers = [
      setTimeout(() => setPhase("content"), t.introMs),
      setTimeout(() => {
        setShowCancel(false);
        onConfirmRef.current?.();
      }, confirmAt),
      setTimeout(() => setPhase("green"), confirmAt + t.settleMs),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desde el círculo verde sí importa el pago real: el check espera a `confirmed`.
  useEffect(() => {
    if (phase !== "green" || !confirmed) return;
    const timer = setTimeout(() => setPhase("success"), t.greenMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, confirmed]);

  useEffect(() => {
    if (phase !== "success") return;
    const timer = setTimeout(() => onContinueRef.current(), t.successMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Red de seguridad: nunca dejar la pantalla congelada si la confirmación no llega.
  useEffect(() => {
    if (phase !== "green" || confirmed) return;
    const timer = setTimeout(() => {
      if (onTimeoutRef.current) onTimeoutRef.current();
      else onContinueRef.current();
    }, t.timeoutMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, confirmed]);

  return (
    <>
      {phase === "circle" && (
        <div className="pointer-events-none fixed inset-0 z-9999 flex items-center justify-center overflow-hidden">
          <div className="pay-circle" />
        </div>
      )}

      {(phase === "content" || phase === "green") && (
        <div className="fixed inset-0 z-9999 overflow-hidden bg-white">
          <div className="animate-fade-in flex min-h-dvh flex-col overflow-y-auto bg-white p-8">
            <div className="flex flex-1 flex-col">
              <div className="relative mt-8 mb-6 w-fit md:mt-12 md:mb-8 lg:mt-14 lg:mb-10">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="pay-ring" />
                  <div className="pay-ring pay-ring-1" />
                  <div className="pay-ring pay-ring-2" />
                </div>
                <div className="relative z-10 flex size-20 items-center justify-center rounded-full md:size-24 lg:size-28">
                  {/* eslint-disable-next-line @next/next/no-img-element -- UI compartida, sin dependencia de next/image */}
                  <img src={logoSrc} alt="" className="size-14 opacity-50 grayscale md:size-16 lg:size-20" />
                </div>
              </div>

              <div className="mr-12 mb-8 text-3xl font-medium text-black md:mr-20 md:mb-12 md:text-5xl lg:mr-24 lg:mb-14 lg:text-6xl">
                {title}
              </div>

              {children}

              {onCancel && (
                <div
                  className={`mt-auto pt-6 pb-4 transition-opacity duration-500 md:pt-8 md:pb-6 ${
                    showCancel ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                >
                  <button
                    type="button"
                    onClick={onCancel}
                    className="cursor-pointer rounded-full border border-stroke/40 bg-surface px-6 py-1 text-sm font-medium text-black transition-all active:scale-95 md:px-8 md:py-1.5 md:text-base lg:py-2"
                  >
                    {cancelLabel}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {phase === "green" && (
        <div className="pointer-events-none fixed inset-0 z-10000 overflow-hidden">
          <div className="p-6 md:p-8 lg:p-10">
            <div className="relative mt-8 mb-6 md:mt-12 md:mb-8 lg:mt-14 lg:mb-10">
              <div className="pay-green-circle" />
            </div>
          </div>
        </div>
      )}

      {phase === "success" && (
        <div className="fixed inset-0 z-9999 overflow-hidden bg-even-grass">
          <div className="flex h-dvh flex-col p-8">
            <div className="flex flex-1 flex-col">
              <div className="pay-fade-in mt-8 mb-6 md:mt-12 md:mb-8 lg:mt-14 lg:mb-10">
                <div className="flex size-20 items-center justify-center rounded-full bg-white md:size-24 lg:size-28">
                  <svg
                    className="size-14 text-even-evergreen md:size-16 lg:size-20"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div className="pay-fade-in mr-16 mb-8 text-3xl font-medium text-even-evergreen md:mr-28 md:mb-12 md:text-5xl lg:mr-32 lg:mb-14 lg:text-6xl">
                {successMessage}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

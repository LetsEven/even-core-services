"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { animate } from "motion/react";
import { SPRING } from "./motion-provider";

const THRESHOLD = 120; // px arrastrados para cerrar
const VELOCITY = 0.6; // px/ms para cerrar con un flick
const RESISTANCE = 0.55; // la hoja sigue al dedo con algo de resistencia

/** ¿Algún ancestro (hasta `root`) tiene scroll acumulado? Si sí, el gesto es de scroll normal. */
function scrolledAncestor(target: EventTarget | null, root: HTMLElement) {
  for (let el = target as HTMLElement | null; el && el !== root.parentElement; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * Cierra el detalle arrastrando hacia abajo cuando el contenido ya está en el tope
 * (overscroll). La hoja sigue al dedo; al soltar, si pasó el umbral o fue un flick
 * rápido se llama a `onDismiss`, y si no regresa con un resorte.
 * El `touchmove` es no pasivo para poder cancelar el rebote nativo de iOS Safari.
 */
export function PullToDismiss({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let dy = 0;
    let lock: "none" | "pull" | "scroll" = "none";
    let tracking = false;
    let spring: { stop: () => void } | null = null;

    const setY = (y: number) => {
      root.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : "";
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      spring?.stop();
      spring = null;
      const t = e.touches[0];
      startX = t.clientX;
      startY = lastY = t.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      dy = 0;
      lock = scrolledAncestor(e.target, root) ? "scroll" : "none";
      tracking = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (lock === "scroll") {
        // Si el contenido vuelve al tope a mitad del gesto, se puede empezar a arrastrar desde ahí.
        if (!scrolledAncestor(e.target, root) && t.clientY > lastY) {
          lock = "none";
          startX = t.clientX;
          startY = t.clientY;
        }
        lastY = t.clientY;
        return;
      }
      if (lock === "none") {
        const ax = Math.abs(t.clientX - startX);
        const ay = t.clientY - startY;
        if (Math.abs(ay) < 6 && ax < 6) return;
        // Solo cuenta un arrastre claramente vertical y hacia abajo (el carrusel de fotos es horizontal).
        if (ay > 0 && ay > ax) lock = "pull";
        else {
          lock = "scroll";
          lastY = t.clientY;
          return;
        }
      }
      // lock === "pull"
      if (e.cancelable) e.preventDefault(); // evita el rebote nativo de iOS
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (t.clientY - lastY) / dt;
      lastY = t.clientY;
      lastT = e.timeStamp;
      dy = Math.max(0, (t.clientY - startY) * RESISTANCE);
      setY(dy);
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (lock !== "pull") return;
      lock = "none";
      if (dy > THRESHOLD * RESISTANCE || velocity > VELOCITY) {
        dismissRef.current();
        return;
      }
      spring = animate(dy, 0, {
        ...SPRING,
        onUpdate: setY,
        onComplete: () => setY(0),
      });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissRef.current();
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", onEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      spring?.stop();
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="h-dvh overscroll-y-none will-change-transform">
      {children}
    </div>
  );
}

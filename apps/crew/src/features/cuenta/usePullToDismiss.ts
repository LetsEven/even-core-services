import { useEffect, useRef, type RefObject } from "react";

// Gesto de "jalar para cerrar" (como un sheet de iOS): estando la vista hasta
// arriba, deslizar el dedo hacia abajo baja la tarjeta siguiendo el dedo; si
// pasa el umbral (o se suelta rápido) se cierra, si no, regresa a su lugar.
// Solo táctil: con rueda/trackpad sería fácil cerrarla sin querer.

/** Distancia (px, ya con resistencia) a partir de la cual se cierra. */
export const DISMISS_DISTANCE = 120;
/** Velocidad (px/ms) de un "flick" hacia abajo que cierra aunque sea corto. */
export const DISMISS_VELOCITY = 0.6;
/** Movimiento mínimo antes de decidir si el gesto es vertical. */
const SLOP = 8;
const ANIM_MS = 220;

/** Desplazamiento con resistencia: sigue al dedo al inicio y se frena después. */
export function dragOffset(dy: number): number {
  if (dy <= 0) return 0;
  return dy < 80 ? dy : 80 + (dy - 80) * 0.55;
}

export function shouldDismiss(offset: number, velocity: number): boolean {
  return offset >= DISMISS_DISTANCE || (offset > 30 && velocity >= DISMISS_VELOCITY);
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

/** El toque empezó en algo que scrollea por su cuenta y no está hasta arriba. */
function insideScrolledChild(target: EventTarget | null, root: HTMLElement): boolean {
  for (let n = target as HTMLElement | null; n && n !== root; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight && n.scrollTop > 0) {
      return true;
    }
  }
  return false;
}

/**
 * `targetRef`: el elemento donde se detecta el gesto (la tarjeta).
 * `moveRefs`: lo que baja junto con el dedo (la tarjeta y su pie fijo).
 */
export function usePullToDismiss(
  targetRef: RefObject<HTMLElement | null>,
  moveRefs: RefObject<HTMLElement | null>[],
  onDismiss: () => void,
  enabled = true,
) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });
  const moveRefsRef = useRef(moveRefs);
  useEffect(() => {
    moveRefsRef.current = moveRefs;
  });

  useEffect(() => {
    const target = targetRef.current;
    if (!enabled || !target) return;

    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    // idle: sin toque; pending: aún no se sabe la dirección; drag: jalando; off: se deja scrollear.
    let phase: "idle" | "pending" | "drag" | "off" = "idle";
    let closing = false;

    const els = () =>
      moveRefsRef.current.map((r) => r.current).filter((e): e is HTMLElement => !!e);
    const apply = (offset: number, animate: boolean) => {
      for (const el of els()) {
        el.style.transition = animate ? `transform ${ANIM_MS}ms ease-out` : "none";
        el.style.transform = offset ? `translateY(${offset}px)` : "";
      }
    };

    const onStart = (e: TouchEvent) => {
      if (closing || e.touches.length !== 1) return;
      const sp = scrollParent(target);
      if ((sp?.scrollTop ?? 0) > 0 || insideScrolledChild(e.target, target)) {
        phase = "off";
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = lastY = t.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      phase = "pending";
    };

    const onMove = (e: TouchEvent) => {
      if (phase === "idle" || phase === "off") return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      if (phase === "pending") {
        const dx = t.clientX - startX;
        if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return;
        // Solo hacia abajo y más vertical que horizontal; si no, scroll normal.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          phase = "off";
          return;
        }
        phase = "drag";
      }
      // Evita que el navegador haga scroll/rebote mientras se jala la tarjeta.
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (t.clientY - lastY) / dt;
      lastY = t.clientY;
      lastT = e.timeStamp;
      apply(dragOffset(dy), false);
    };

    const onEnd = () => {
      if (phase !== "drag") {
        phase = "idle";
        return;
      }
      phase = "idle";
      const offset = dragOffset(lastY - startY);
      if (shouldDismiss(offset, velocity)) {
        closing = true;
        apply(window.innerHeight, true);
        setTimeout(() => onDismissRef.current(), ANIM_MS);
      } else {
        apply(0, true);
      }
    };

    target.addEventListener("touchstart", onStart, { passive: true });
    target.addEventListener("touchmove", onMove, { passive: false });
    target.addEventListener("touchend", onEnd);
    target.addEventListener("touchcancel", onEnd);
    return () => {
      target.removeEventListener("touchstart", onStart);
      target.removeEventListener("touchmove", onMove);
      target.removeEventListener("touchend", onEnd);
      target.removeEventListener("touchcancel", onEnd);
      apply(0, false);
    };
  }, [targetRef, enabled]);
}

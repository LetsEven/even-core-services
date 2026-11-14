/**
 * Transición "el botón se convierte en el panel", de forma continua: mientras el botón (un círculo
 * con su tamaño) viaja hacia el centro del panel ya va creciendo, y llega ahí casi con su forma
 * final; después se asienta y el contenido se despliega. Al cerrar se hace lo inverso. No deforma el contenido: el panel se mueve con `transform`
 * y se recorta con `clip-path`.
 */

export const MORPH_OPEN_MS = 820;
export const MORPH_CLOSE_MS = 640;
/** Movimiento y crecimiento arrancan juntos; el crecimiento se retrasa un poco para que se note el viaje. */
const MOVE_EASE = "cubic-bezier(0.45, 0, 0.15, 1)";
const GROW_EASE = "cubic-bezier(0.5, 0, 0.1, 1)";
const GROW_DELAY = 0.1;
const SETTLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Geometry = { travel: string; circle: string; full: string };

function geometry(card: HTMLElement, origin: DOMRect, fullRadius: string): Geometry {
  const box = card.getBoundingClientRect();
  const dx = origin.left + origin.width / 2 - (box.left + box.width / 2);
  const dy = origin.top + origin.height / 2 - (box.top + box.height / 2);
  const insetX = Math.max(0, (box.width - origin.width) / 2);
  const insetY = Math.max(0, (box.height - origin.height) / 2);
  return {
    travel: `translate(${dx}px, ${dy}px)`,
    circle: `inset(${insetY}px ${insetX}px ${insetY}px ${insetX}px round ${origin.height / 2}px)`,
    full: `inset(0px 0px 0px 0px round ${fullRadius})`,
  };
}

function fadeChildren(card: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  for (const child of Array.from(card.children)) child.animate(keyframes, options);
}

export function playMorphOpen(
  card: HTMLElement,
  origin: DOMRect,
  options: { backdrop?: HTMLElement | null; fullRadius?: string } = {},
) {
  const g = geometry(card, origin, options.fullRadius ?? "32px");
  card.animate([{ transform: g.travel }, { transform: "translate(0px, 0px)" }], {
    duration: MORPH_OPEN_MS,
    easing: MOVE_EASE,
    composite: "add",
  });
  card.animate([{ clipPath: g.circle }, { clipPath: g.full }], {
    duration: MORPH_OPEN_MS * (1 - GROW_DELAY),
    delay: MORPH_OPEN_MS * GROW_DELAY,
    easing: GROW_EASE,
    fill: "backwards",
  });
  options.backdrop?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: MORPH_OPEN_MS * 0.6,
    easing: SETTLE_EASE,
  });
  fadeChildren(card, [{ opacity: 0 }, { opacity: 1 }], {
    duration: 260,
    delay: MORPH_OPEN_MS * 0.6,
    easing: "ease-out",
    fill: "backwards",
  });
}

export function playMorphClose(
  card: HTMLElement,
  origin: DOMRect,
  done: () => void,
  options: { backdrop?: HTMLElement | null; fullRadius?: string } = {},
) {
  const g = geometry(card, origin, options.fullRadius ?? "32px");
  fadeChildren(card, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease-in", fill: "forwards" });
  options.backdrop?.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: MORPH_CLOSE_MS,
    easing: SETTLE_EASE,
    fill: "forwards",
  });
  card.animate([{ clipPath: g.full }, { clipPath: g.circle }], {
    duration: MORPH_CLOSE_MS * (1 - GROW_DELAY),
    easing: GROW_EASE,
    fill: "forwards",
  });
  const anim = card.animate([{ transform: "translate(0px, 0px)" }, { transform: g.travel }], {
    duration: MORPH_CLOSE_MS,
    delay: MORPH_CLOSE_MS * GROW_DELAY,
    easing: MOVE_EASE,
    composite: "add",
    fill: "both",
  });
  anim.onfinish = () => {
    const finished = card.getAnimations({ subtree: true });
    done();
    // El panel se reutiliza (píldora): sin estas animaciones congeladas se vería encogido al reabrir.
    requestAnimationFrame(() => finished.forEach((a) => a.cancel()));
  };
}

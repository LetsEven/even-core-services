import { useCallback, useLayoutEffect, useRef } from "react";
import { playMorphClose, playMorphOpen, prefersReducedMotion } from "@even/ui";

/**
 * Hace que un botón "se convierta" en el panel que abre: el botón viaja al lugar del panel y
 * ahí se expande; al cerrar regresa. Ver `playMorphOpen` en @even/ui.
 *
 * Uso: `rememberOrigin(boton)` justo antes de abrir, asigna `cardRef`/`backdropRef`
 * al panel y al fondo, y cierra con `closeWithMorph(() => setOpen(false))`.
 */
export function useButtonMorph(open: boolean) {
  const originRef = useRef<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const rememberOrigin = useCallback((el: Element | null) => {
    originRef.current = el ? el.getBoundingClientRect() : null;
  }, []);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const origin = originRef.current;
    if (!open || !card || !origin || prefersReducedMotion()) return;
    playMorphOpen(card, origin, { backdrop: backdropRef.current });
  }, [open]);

  const closeWithMorph = useCallback((done: () => void) => {
    const card = cardRef.current;
    const origin = originRef.current;
    if (!card || !origin || prefersReducedMotion()) {
      done();
      return;
    }
    playMorphClose(card, origin, done, { backdrop: backdropRef.current });
  }, []);

  return { cardRef, backdropRef, rememberOrigin, closeWithMorph };
}

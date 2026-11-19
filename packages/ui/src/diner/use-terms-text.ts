"use client";

import { useTranslations } from "next-intl";

/**
 * Texto plano de la casilla de términos (sin las etiquetas `<terms>`/`<privacy>`): el esqueleto lo usa para ocupar
 * las mismas líneas que la casilla real.
 */
export function useTermsText(): string {
  const t = useTranslations("Terms");
  return String(t.raw("checkbox")).replace(/<\/?[a-z]+>/g, "");
}

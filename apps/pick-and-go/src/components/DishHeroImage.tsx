"use client";

import { useEffect, type ReactNode } from "react";
import { markDishReady, useDishFlight } from "@/lib/dish-transition";

/**
 * Foto grande del detalle. Al montarse avisa a `DishFlight` para que la foto que
 * viene volando desde la tarjeta del menú aterrice encima de ella.
 */
export default function DishHeroImage({
  src,
  ready = false,
  className = "",
  children,
}: {
  src?: string | null;
  /** Contenido real (no esqueleto): ya se puede retirar la foto en vuelo. */
  ready?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  // Mientras la foto viene volando desde la tarjeta, esta no se pinta (evita verla duplicada).
  const hidden = useDishFlight()?.mode === "open";
  useEffect(() => {
    if (ready) markDishReady();
  }, [ready]);
  return (
    <div data-dish-hero className={`overflow-hidden bg-tone-300 ${hidden ? "opacity-0" : ""} ${className}`}>
      {src && <img src={src} alt="" className="absolute inset-0 size-full object-cover" />}
      {children}
    </div>
  );
}

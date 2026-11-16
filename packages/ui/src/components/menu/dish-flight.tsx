"use client";

import { m } from "motion/react";
import { SPRING } from "./motion-provider";
import { markDishAnimationDone, useDishFlight } from "../../lib/dish-transition";

/**
 * Foto en vuelo + hoja blanca + velo desenfocado, al estilo de la App Store. Vive
 * en el layout de [restaurantId] (fuera de las rutas y de AnimatePresence), así que
 * sobrevive al cambio menú ⇄ detalle. El blur es un `backdrop-filter` fijo: solo se
 * anima su opacidad (animar el radio es muy pesado en iOS).
 */
export function DishFlight() {
  const flight = useDishFlight();
  if (!flight) return null;
  const open = flight.mode === "open";
  const end = flight.phase === "end";
  const box = end ? flight.to : flight.from;
  // La hoja entra desde abajo al abrir y sale hacia abajo al volver.
  const sheetHidden = window.innerHeight - flight.sheetTop;
  const sheetY = (open ? !end : end) ? sheetHidden : 0;
  const toCard = open ? !end : end;
  // Al abrir, todo va por debajo del contenido del detalle (z-10) para no tapar su esqueleto;
  // al volver, por encima de la página que se está yendo.
  const z = open ? { veil: 3, img: 4, sheet: 5 } : { veil: 80, img: 81, sheet: 82 };

  return (
    <>
      <m.div
        key={`veil-${flight.mode}-${flight.id}`}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, times: [0, 0.35, 1], ease: "easeOut" }}
        style={{ zIndex: z.veil }}
        className="pointer-events-none fixed inset-0 bg-white/40 backdrop-blur-md [-webkit-backdrop-filter:blur(12px)]"
      />
      <m.div
        key={`img-${flight.mode}-${flight.id}`}
        layout
        aria-hidden
        onLayoutAnimationComplete={markDishAnimationDone}
        transition={SPRING}
        style={{
          position: "fixed",
          zIndex: z.img,
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          borderRadius: toCard ? 12 : 0,
        }}
        className="pointer-events-none overflow-hidden bg-tone-300"
      >
        <img src={flight.src} alt="" className="size-full object-cover" />
      </m.div>
      <m.div
        key={`sheet-${flight.mode}-${flight.id}`}
        aria-hidden
        initial={{ y: sheetY }}
        animate={{ y: sheetY }}
        transition={SPRING}
        style={{ position: "fixed", zIndex: z.sheet, left: 0, right: 0, bottom: 0, top: flight.sheetTop }}
        className="pointer-events-none rounded-t-4xl bg-white"
      />
    </>
  );
}

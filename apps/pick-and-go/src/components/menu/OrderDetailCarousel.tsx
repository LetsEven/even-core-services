"use client";

import { Children, useCallback, useRef, useState } from "react";

interface OrderDetailCarouselProps {
  children: React.ReactNode;
  /** Etiquetas accesibles de cada página, en el mismo orden que los hijos. */
  labels?: string[];
}

/**
 * Carrusel horizontal deslizable (scroll-snap) con indicadores de puntos.
 * Cada hijo es una página a todo el ancho.
 */
export default function OrderDetailCarousel({
  children,
  labels = [],
}: OrderDetailCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = Children.count(children);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <div
        className="flex justify-center items-center gap-2 py-3 flex-shrink-0"
        role="tablist"
      >
        {Array.from({ length: count }).map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={labels[i] ?? String(i + 1)}
            onClick={() => goTo(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === index ? "w-5 bg-white" : "w-2 bg-white/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

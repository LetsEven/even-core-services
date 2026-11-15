import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { useBlurredImage } from "../lib/blurred-image";

/**
 * Layout compartido de las vistas "tarjeta sobre fondo" del flujo de compra
 * (carrito, pedido, tarjetas, pago, etc.). La referencia es el detalle de
 * producto: la tarjeta blanca abarca todo el ancho de la pantalla, sin
 * márgenes laterales, y crece hasta el borde inferior.
 *
 *   <SheetScreen>
 *     <Header />
 *     <SheetHero>Título</SheetHero>      // opcional, asoma detrás de la tarjeta
 *     <SheetCard>…contenido…</SheetCard>
 *     <SheetFooter>…acciones fijas…</SheetFooter>
 *   </SheetScreen>
 */

/** Padding lateral interno de la tarjeta (único para todas las vistas). */
const SHEET_PADDING_X = "px-6 md:px-8 lg:px-10";

/**
 * Clases base del layout, para vistas con estructura propia (skeletons,
 * tarjetas ancladas al fondo) que no pueden usar los componentes.
 */
export const sheetClasses = {
  screen: "app-col relative z-10 isolate flex min-h-dvh flex-col",
  hero: "sheet-hero z-0 mx-4 translate-y-7 rounded-t-4xl md:mx-6 lg:mx-8",
  card: cn("sheet-card relative z-10 flex w-full flex-1 flex-col rounded-t-4xl bg-white", SHEET_PADDING_X),
} as const;

export type SheetBackdropProps = Omit<ComponentProps<"div">, "children"> & {
  /** Imagen del restaurante (banner). Sin ella queda el verde de marca. */
  imageUrl?: string | null;
};

/**
 * Fondo común de todo el flujo de compra: la imagen del restaurante desenfocada
 * y oscurecida. Se monta una sola vez en un layout (no por vista) y las pantallas
 * (`SheetScreen`) quedan transparentes por encima.
 */
export function SheetBackdrop({ imageUrl, className, ...props }: SheetBackdropProps) {
  // Miniatura ya desenfocada y cacheada; si no se puede generar (sin CORS) se usa
  // la original con desenfoque CSS.
  const blurred = useBlurredImage(imageUrl);
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 z-0 overflow-hidden bg-even-evergreen", className)}
      {...props}
    >
      {imageUrl && blurred !== undefined && (
        // eslint-disable-next-line @next/next/no-img-element -- UI compartida, sin dependencia de next/image
        <img
          src={blurred ?? imageUrl}
          alt=""
          className={cn("absolute inset-0 size-full object-cover", blurred ? "scale-105" : "scale-110 blur-xl")}
        />
      )}
      {imageUrl && <div className="absolute inset-0 bg-black/30" />}
    </div>
  );
}

export type SheetScreenProps = ComponentProps<"div">;

/** Pantalla completa sobre el fondo de marca (o la imagen que pase la app vía `className`/`style`). */
export function SheetScreen({ className, ...props }: SheetScreenProps) {
  return <div className={cn(sheetClasses.screen, className)} {...props} />;
}

export type SheetHeroProps = ComponentProps<"div">;

/** Bloque de título que asoma detrás de la tarjeta (efecto de capas). */
export function SheetHero({ className, ...props }: SheetHeroProps) {
  return (
    <div
      className={cn(sheetClasses.hero, "px-8 py-6 md:px-10 md:py-8 lg:px-12 lg:py-10", className)}
      {...props}
    />
  );
}

export type SheetCardProps = ComponentProps<"div">;

/** Tarjeta blanca de ancho completo; llena la altura restante de la pantalla. */
export function SheetCard({ className, ...props }: SheetCardProps) {
  return (
    <div
      className={cn(sheetClasses.card, className)}
      {...props}
    />
  );
}

export type SheetFooterProps = ComponentProps<"div">;

/** Barra de acciones fija al borde inferior, alineada con el ancho de la tarjeta. */
export function SheetFooter({ className, style, ...props }: SheetFooterProps) {
  return (
    <div
      className={cn(
        "fixed fixed-col bottom-0 z-20 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]",
        SHEET_PADDING_X,
        className,
      )}
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))", ...style }}
      {...props}
    />
  );
}

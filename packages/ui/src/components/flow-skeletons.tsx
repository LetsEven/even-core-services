"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Ghost } from "./flow-nav-overlay";
import { sheetClasses } from "./sheet-screen";

/**
 * Esqueletos del flujo de compra (carrito → confirmación → pago) compartidos por las apps de pedido.
 *
 * La regla para que la tarjeta quede a la misma altura que ya cargada: el esqueleto reutiliza las MISMAS
 * clases y tipografía que la vista real, y los datos que cambian (importes, nombres) son `Ghost`: texto de
 * relleno transparente con la misma fuente, así la línea mide lo mismo que el dato real. Lo que no cambia
 * (títulos, etiquetas) se muestra con su texto real, por eso cada app pasa sus `labels`.
 * Los usan tanto el `FlowNavOverlay` de la transición como las vistas mientras cargan.
 */

/**
 * Título de un paso: línea de contexto opcional (marca, mesa, habitación) y título, con la tipografía de las
 * vistas reales. `labelClassName` cambia el color de la línea de contexto (por defecto `text-mist`).
 */
export function StepHero({ label, title, labelClassName }: { label?: ReactNode; title: ReactNode; labelClassName?: string }) {
  return (
    <div className="flex flex-col justify-center px-8 py-6 md:px-10 md:py-8 lg:px-12 lg:py-10">
      {label != null && (
        <p className={cn("text-xl font-medium text-mist md:text-2xl lg:text-3xl", labelClassName)}>{label}</p>
      )}
      <p className="mt-2 mb-6 text-3xl leading-7 font-medium text-white md:mt-3 md:mb-8 md:text-4xl md:leading-9 lg:text-5xl lg:leading-tight">
        {title}
      </p>
    </div>
  );
}

/** Bloque de título completo (hero) para las vistas reales mientras cargan; dentro del overlay lo pone `FlowCard`. */
export function FlowHeroBlock({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(sheetClasses.hero, className)}>{children}</div>;
}

export type OrderConfirmSkeletonLabels = {
  /** "Sucursal:" — solo si la vista real muestra la sucursal. */
  branch?: string;
  subtotal: string;
  tip: string;
  totalToPay: string;
  continueCta: string;
};

/** Cuerpo de la tarjeta de confirmación: mismas filas y márgenes que la vista cargada. */
export function OrderConfirmSkeleton({ labels }: { labels: OrderConfirmSkeletonLabels }) {
  return (
    <>
      {labels.branch != null && (
        <div className="mb-4 flex w-full items-center justify-between">
          <p className="text-base text-tone-600">
            {labels.branch} <Ghost className="font-medium">Sucursal</Ghost>
          </p>
        </div>
      )}
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-black">{labels.subtotal}</span>
          <Ghost className="font-medium">$000.00 MXN</Ghost>
        </div>
      </div>
      <div className="mb-4">
        <div className="mb-3 flex items-center gap-4">
          <span className="text-base font-medium whitespace-nowrap text-black md:text-lg lg:text-xl">{labels.tip}</span>
          <div className="grid flex-1 grid-cols-5 gap-2">
            {["0%", "10%", "15%", "20%", "$"].map((label) => (
              <div
                key={label}
                className="animate-pulse rounded-full border border-transparent bg-tone-100 py-1 md:py-1.5 lg:py-2"
              >
                <span className="invisible">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-end text-sm">
          <Ghost className="font-medium">+$00.00 MXN</Ghost>
        </div>
      </div>
      <div className="mb-6 flex items-center justify-between border-t pt-4">
        <span className="text-base font-medium text-black md:text-lg lg:text-xl">{labels.totalToPay}</span>
        <Ghost className="text-base font-medium md:text-lg lg:text-xl">$000.00 MXN</Ghost>
      </div>
      <div className="w-full animate-pulse rounded-full bg-even-grass/40 py-3 text-center">
        <span className="invisible">{labels.continueCta}</span>
      </div>
    </>
  );
}

/** Cuerpo del carrito: etiqueta, dos filas de producto y la barra inferior fija. */
export function CartSkeleton({ labels }: { labels: { myCart: string } }) {
  return (
    <>
      <div className="pt-6 md:pt-8">
        <p className="mx-auto w-fit rounded-full border border-stroke bg-surface px-3 py-1 text-base font-medium text-black md:px-4 md:py-1.5 md:text-lg lg:px-5 lg:text-xl">
          {labels.myCart}
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-6">
        {[0, 1].map((row) => (
          <div key={row} className="flex h-16 items-center gap-3">
            <div className="size-16 shrink-0 animate-pulse rounded-lg bg-tone-100" />
            <div className="flex flex-1 flex-col gap-2">
              <Ghost className="w-2/3">Producto</Ghost>
              <Ghost className="w-1/3">Detalle</Ghost>
            </div>
            <Ghost>$000.00</Ghost>
          </div>
        ))}
      </div>
      {/* Barra inferior fija: 100 px como la real */}
      <div className="fixed fixed-col bottom-0 z-10 bg-white px-6 pt-6 pb-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:px-8 lg:px-10">
        <div className="flex h-[52px] items-center justify-between gap-3">
          <Ghost className="w-24">2 artículos</Ghost>
          <div className="h-full w-36 animate-pulse rounded-full bg-even-grass/40" />
        </div>
      </div>
    </>
  );
}

export type CardSelectionSkeletonLabels = {
  subtotal: string;
  totalToPay: string;
  paymentMethods: string;
};

/**
 * Cuerpo del pago: resumen, métodos y la barra fija con el botón de pagar (96 px como la real).
 * `showSubtotal={false}` para las apps cuyo resumen es solo la fila del total (Tap & Pay, FlexBill).
 */
export function CardSelectionSkeleton({
  labels,
  showSubtotal = true,
}: {
  labels: CardSelectionSkeletonLabels;
  showSubtotal?: boolean;
}) {
  return (
    <div className="flex-1 py-8 pb-[120px]">
      {showSubtotal ? (
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between text-base font-medium text-black">
            <span>{labels.subtotal}</span>
            <Ghost>$000.00 MXN</Ghost>
          </div>
          <div className="flex items-center justify-between border-t pt-3 text-base font-medium text-black">
            <span>{labels.totalToPay}</span>
            <Ghost>$000.00 MXN</Ghost>
          </div>
        </div>
      ) : (
        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between text-base font-medium text-black md:text-lg lg:text-xl">
            <span>{labels.totalToPay}</span>
            <Ghost>$000.00 MXN</Ghost>
          </div>
        </div>
      )}
      <h3 className="mb-3 font-medium text-black">{labels.paymentMethods}</h3>
      <div className="space-y-2.5">
        <div className="h-[46px] w-full animate-pulse rounded-full bg-tone-100" />
        <div className="h-[46px] w-full animate-pulse rounded-full bg-tone-100" />
      </div>
      <div className="fixed fixed-col bottom-0 z-10 bg-white px-6 py-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:px-8 lg:px-10">
        <div className="h-12 w-full animate-pulse rounded-full bg-even-grass/40" />
      </div>
    </div>
  );
}

/** Cuerpo de "opciones de pago": cuatro filas con icono, título y flecha, y el total fijo abajo. */
export function PaymentOptionsSkeleton() {
  return (
    <>
      <div className="flex-1 overflow-y-auto pb-35 md:pb-40 lg:pb-45">
        <div className="mt-4 flex flex-col md:mt-6">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="w-full animate-pulse border-b border-stroke bg-white">
              <div className="flex items-center gap-3 px-4 py-3 md:gap-4 md:px-5 md:py-4 lg:gap-5 lg:px-6 lg:py-5">
                <div className="size-16 rounded-sm bg-tone-200 md:size-20 md:rounded-md lg:size-24" />
                <div className="flex-1">
                  <div className="mb-2 h-5 w-3/4 rounded bg-tone-200" />
                  <div className="h-4 w-1/2 rounded bg-tone-200" />
                </div>
                <div className="size-5 rounded bg-tone-200 md:size-6 lg:size-7" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="fixed fixed-col bottom-0 z-10 bg-white px-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:px-8 lg:px-10">
        <div className="animate-pulse space-y-2 py-4 md:space-y-3 md:py-8 lg:py-12">
          <div className="flex items-center justify-between">
            <div className="h-6 w-32 rounded bg-tone-200" />
            <div className="h-6 w-24 rounded bg-tone-200" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 rounded bg-tone-200" />
            <div className="h-5 w-20 rounded bg-tone-200" />
          </div>
        </div>
      </div>
    </>
  );
}

export type TipSkeletonLabels = {
  /** Fila del total/subtotal ("Total:"). */
  total: string;
  tip: string;
  totalToPay: string;
  payCta: string;
};

/**
 * Cuerpo de "propina" (cuenta completa): resumen, selector de propina, y total con botón de pagar.
 * Mismas clases que la vista real, de modo que la tarjeta mide lo mismo antes y después de cargar.
 */
export function TipSkeleton({ labels }: { labels: TipSkeletonLabels }) {
  return (
    <>
      <div className="space-y-4 px-8 md:space-y-5 md:px-10 lg:space-y-6 lg:px-12">
        <div className="space-y-2 md:space-y-3 lg:space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-base font-medium text-black md:text-lg lg:text-xl">{labels.total}</span>
            <Ghost className="text-base font-medium md:text-lg lg:text-xl">$000.00 MXN</Ghost>
          </div>
        </div>
        <div className="md:mb-4 lg:mb-5">
          <div className="mb-3 flex items-center gap-4">
            <span className="text-base font-medium whitespace-nowrap text-black md:text-lg lg:text-xl">{labels.tip}</span>
            <div className="grid flex-1 grid-cols-5 gap-2">
              {["0%", "10%", "15%", "20%", "$"].map((label) => (
                <div
                  key={label}
                  className="animate-pulse rounded-full border border-transparent bg-tone-100 py-1 md:py-1.5 lg:py-2"
                >
                  <span className="invisible">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end text-sm">
            <Ghost className="font-medium">+$00.00 MXN</Ghost>
          </div>
        </div>
      </div>
      <div className="px-8 md:px-10 lg:px-12">
        <div className="border-t border-tone-200 pt-6">
          <div className="flex w-full justify-between gap-3">
            <div className="flex -translate-y-2 flex-col justify-center">
              <span className="text-sm text-tone-600 md:text-base lg:text-lg">{labels.totalToPay}</span>
              <div className="flex w-fit items-center justify-center gap-2 text-2xl font-medium text-black md:text-3xl lg:text-4xl">
                <Ghost>$000.00</Ghost>
                <span className="size-4" />
              </div>
            </div>
            <div className="flex h-10 animate-pulse items-center justify-center rounded-full bg-even-grass/40 px-15 text-base md:h-12 md:text-lg lg:h-12 lg:text-xl">
              <span className="invisible">{labels.payCta}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

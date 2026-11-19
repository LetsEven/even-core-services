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
export function TipSkeleton({ labels, before }: { labels: TipSkeletonLabels; before?: ReactNode }) {
  return (
    <>
      {before}
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

export type UserSkeletonLabels = {
  /** "¿Cómo te llamas?" — etiqueta del campo de nombre. */
  name: string;
  /** Texto plano de los términos (sin etiquetas): ocupa las mismas líneas que el real. */
  terms: string;
  continueCta: string;
};

/**
 * Cuerpo de "captura de nombre" (invitado): etiqueta, campo y términos, con la barra del botón abajo.
 * La tarjeta real lleva `pb-32` (ver `userShell`).
 */
export function UserSkeleton({ labels }: { labels: UserSkeletonLabels }) {
  return (
    <>
      <div className="flex w-full flex-col items-center pt-32 md:pt-36 lg:pt-40">
        <div className="mb-6 md:mb-8">
          <span className="text-lg font-medium text-black md:text-xl lg:text-2xl">{labels.name}</span>
        </div>
        <div className="w-full">
          <div className="w-full animate-pulse rounded-full border border-transparent bg-tone-100 px-6 py-3 text-center text-xl font-normal md:px-8 md:py-4 md:text-2xl lg:px-10 lg:py-5 lg:text-3xl">
            <span className="invisible">Nombre</span>
          </div>
        </div>
        <div className="mt-6 w-full">
          <Ghost className="block w-full text-sm">{labels.terms}</Ghost>
        </div>
      </div>
      <div className="fixed fixed-col bottom-0 z-50 flex justify-center py-4 md:py-5 lg:py-6">
        <div className="mx-4 w-full max-w-full px-4 md:mx-6 md:px-6 lg:mx-8 lg:px-8">
          <div className="w-full animate-pulse rounded-full bg-even-grass/40 py-3 text-center text-base md:py-4 md:text-lg lg:py-5 lg:text-xl">
            <span className="invisible">{labels.continueCta}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export type AddCardSkeletonLabels = {
  fullName: string;
  cardNumber: string;
  expiry: string;
  saveCta: string;
};

const ADD_CARD_INPUT =
  "w-full animate-pulse rounded-lg border border-transparent bg-tone-100 px-4 py-3 md:px-5 md:py-4 lg:px-6 lg:py-5";

/** Cuerpo de "agregar tarjeta": cuatro campos y el botón de guardar, con las mismas clases que el formulario real. */
export function AddCardSkeleton({ labels }: { labels: AddCardSkeletonLabels }) {
  const field = (label: ReactNode) => (
    <div className="text-sm md:text-base lg:text-lg">
      <span className="mb-2 block text-tone-700">{label}</span>
      <div className={ADD_CARD_INPUT}>
        <span className="invisible">Dato</span>
      </div>
    </div>
  );
  return (
    <>
      <div className="space-y-4 text-sm md:space-x-5 md:text-base lg:text-lg">
        {field(labels.fullName)}
        {field(labels.cardNumber)}
        <div className="text-sm md:text-base lg:text-lg">
          <span className="mb-2 block text-tone-700">{labels.expiry}</span>
          <div className="flex gap-3">
            <div className={cn(ADD_CARD_INPUT, "flex-1")}>
              <span className="invisible">01</span>
            </div>
            <div className={cn(ADD_CARD_INPUT, "flex-1")}>
              <span className="invisible">2030</span>
            </div>
          </div>
        </div>
        {field("CVV")}
      </div>
      <div className="mt-8 w-full animate-pulse rounded-full bg-black/20 py-3 text-base md:py-4 md:text-lg lg:py-5 lg:text-xl">
        <span className="invisible block text-center">{labels.saveCta}</span>
      </div>
    </>
  );
}

/** Bloque de "elegir monto" (etiqueta, campo y máximo) que va sobre el resumen de la propina. */
export function ChooseAmountSkeletonBlock({
  labels,
  spaced = false,
}: {
  labels: { amountToPay: string; maximum: string };
  /** Margen inferior (`mb-6`) hacia el resumen, como en las apps que lo llevan. */
  spaced?: boolean;
}) {
  return (
    <div className={cn("px-8 md:px-10 lg:px-12", spaced && "mb-6")}>
      <div className="flex w-full flex-col items-center">
        <span className="mb-4 block text-xl font-medium text-black md:mb-5 md:text-2xl lg:mb-6 lg:text-3xl">
          {labels.amountToPay}
        </span>
        <div className="w-full max-w-xs">
          <div className="w-full animate-pulse rounded-lg border-2 border-transparent bg-tone-100 py-3 text-center text-2xl font-semibold">
            <span className="invisible">0.00</span>
          </div>
        </div>
        <Ghost className="mt-3 text-sm">{labels.maximum}</Ghost>
      </div>
    </div>
  );
}

/**
 * Cuerpo de "seleccionar artículos": encabezado de columnas, filas de platillos (casilla, foto, nombre, cantidad y
 * precio), la indicación de elegir uno y el resumen fijo abajo. La cantidad de filas real depende de la mesa.
 */
export function SelectItemsSkeleton({
  labels,
  showImages = true,
  showGuest = true,
  rows = 2,
}: {
  labels: TipSkeletonLabels & { qty: string; price: string; hint: string };
  /** La vista real muestra la foto del platillo (según el restaurante). */
  showImages?: boolean;
  /** La vista real muestra el nombre del comensal sobre el platillo (FlexBill). */
  showGuest?: boolean;
  /** Platillos por pagar, si ya se conocen (la mesa ya se cargó en el paso anterior). */
  rows?: number;
}) {
  return (
    <>
      <div className="mb-6 px-8 md:px-10 lg:px-12">
        <div className="flex translate-y-4 justify-end gap-10 text-sm font-medium text-black md:gap-12 md:text-base lg:gap-14 lg:text-lg">
          <span>{labels.qty}</span>
          <span>{labels.price}</span>
        </div>
        <div className="space-y-3">
          {Array.from({ length: Math.max(rows, 1) }, (_, row) => (
            <div key={row} className="py-3 md:py-4 lg:py-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-5 shrink-0 animate-pulse rounded-full border-2 border-transparent bg-tone-100 md:size-6 lg:size-7" />
                  {showImages && (
                    <div className="size-12 shrink-0 animate-pulse rounded-sm bg-tone-100 md:size-14 lg:size-16" />
                  )}
                  <div className="min-w-0 flex-1">
                    {showGuest && <Ghost className="block text-sm md:text-base lg:text-lg">NOMBRE</Ghost>}
                    <Ghost className="block text-base md:text-lg lg:text-xl">Platillo</Ghost>
                  </div>
                </div>
                <div className="flex gap-10 text-right md:gap-12 lg:gap-14">
                  <Ghost className="text-base md:text-lg lg:text-xl">1</Ghost>
                  <Ghost className="w-14 text-base md:w-16 md:text-lg lg:w-20 lg:text-xl">$000.00</Ghost>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Ghost className="mt-2 block text-center text-sm md:text-base lg:text-lg">{labels.hint}</Ghost>
      </div>
      <div className="fixed fixed-col bottom-0 z-40 bg-white pt-8 pb-6 md:pt-10 lg:pt-12">
        <TipSkeleton labels={labels} />
      </div>
    </>
  );
}

"use client";

import { cn, sheetClasses } from "@even/ui";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FlowStep } from "@/lib/route-transition";

/**
 * Esqueletos del flujo de compra (carrito → confirmación → pago).
 *
 * La regla para que la tarjeta quede a la misma altura que ya cargada: el
 * esqueleto reutiliza las MISMAS clases y la misma tipografía que la vista real,
 * y los datos que cambian (importes, nombres) son `Ghost`: texto de relleno
 * transparente con la misma fuente, así la línea mide lo mismo que el dato real
 * sin tener que calcular alturas a mano. Lo que no cambia (títulos, etiquetas)
 * se muestra con su texto real.
 */

/** Dato que aún no llega: ocupa lo mismo que el texto real, pero se ve como barra. */
export function Ghost({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span aria-hidden className={cn("animate-pulse rounded-full bg-tone-200 text-transparent select-none", className)}>
      {children}
    </span>
  );
}

/** Título del paso con la misma tipografía y márgenes que la vista real. */
export function FlowHero({ step }: { step: FlowStep }) {
  const cart = useTranslations("CartView");
  const confirm = useTranslations("OrderConfirmPage");
  const pay = useTranslations("CardSelectionPage");

  if (step === "cart") {
    return (
      <div className={cn(sheetClasses.hero, "p-0")}>
        <div className="flex flex-col justify-center px-8 py-6 md:px-10 md:py-8 lg:px-12 lg:py-10">
          <p className="text-xl font-medium text-mist md:text-2xl lg:text-3xl">Pick & Go</p>
          <p className="mt-2 mb-6 text-3xl leading-7 font-medium text-white md:mt-3 md:mb-8 md:text-4xl md:leading-9 lg:text-5xl lg:leading-tight">
            {cart("confirmYourOrder")}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className={sheetClasses.hero}>
      <div className="flex flex-col justify-center px-8 py-6">
        <p className="mt-2 mb-6 text-3xl leading-7 font-medium text-white">
          {step === "order-confirm" ? confirm("title") : pay("selectPaymentMethodTitle")}
        </p>
      </div>
    </div>
  );
}

/** Cuerpo de la tarjeta de confirmación: mismas filas y márgenes que la vista cargada (con sucursal y propina). */
export function OrderConfirmBody() {
  const t = useTranslations("OrderConfirmPage");
  const tc = useTranslations("Common");
  return (
    <>
      <div className="mb-4 flex w-full items-center justify-between">
        <p className="text-base text-tone-600">
          {tc("branchLabel")} <Ghost className="font-medium">Sucursal</Ghost>
        </p>
      </div>
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-black">{tc("subtotal")}</span>
          <Ghost className="font-medium">$000.00 MXN</Ghost>
        </div>
      </div>
      <div className="mb-4">
        <div className="mb-3 flex items-center gap-4">
          <span className="text-base font-medium whitespace-nowrap text-black md:text-lg lg:text-xl">{tc("tip")}</span>
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
        <span className="text-base font-medium text-black md:text-lg lg:text-xl">{tc("totalToPay")}</span>
        <Ghost className="text-base font-medium md:text-lg lg:text-xl">$000.00 MXN</Ghost>
      </div>
      <div className="w-full animate-pulse rounded-full bg-even-grass/40 py-3 text-center">
        <span className="invisible">{t("continueCta")}</span>
      </div>
    </>
  );
}

/** Cuerpo del carrito: etiqueta, dos filas de producto y la barra inferior fija. */
export function CartBody() {
  const t = useTranslations("CartView");
  return (
    <>
      <div className="pt-6 md:pt-8">
        <p className="mx-auto w-fit rounded-full border border-stroke bg-surface px-3 py-1 text-base font-medium text-black md:px-4 md:py-1.5 md:text-lg lg:px-5 lg:text-xl">
          {t("myCart")}
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

/** Cuerpo del pago: resumen, tarjeta elegida, "agregar método" y la barra fija (96 px como la real). */
export function CardSelectionBody() {
  const t = useTranslations("CardSelectionPage");
  const tc = useTranslations("Common");
  return (
    <div className="flex-1 py-8 pb-[120px]">
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between text-base font-medium text-black">
          <span>{tc("subtotal")}</span>
          <Ghost>$000.00 MXN</Ghost>
        </div>
        <div className="flex items-center justify-between border-t pt-3 text-base font-medium text-black">
          <span>{tc("totalToPay")}</span>
          <Ghost>$000.00 MXN</Ghost>
        </div>
      </div>
      <h3 className="mb-3 font-medium text-black">{t("paymentMethodsLabel")}</h3>
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

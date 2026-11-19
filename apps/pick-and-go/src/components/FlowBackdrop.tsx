"use client";

import { SheetBackdrop } from "@even/ui";
import { usePathname } from "next/navigation";
import { FLOW_STEPS } from "@/lib/flow-steps";

// Pasos del flujo de compra (y del acceso) que se pintan sobre el fondo desenfocado.
const BACKDROP_STEPS: readonly string[] = [...FLOW_STEPS, "payment-success"];

/**
 * Fondo verde de marca compartido por todo el flujo (menos el menú). Vive en el
 * layout de [restaurantId], así que no se desmonta al cambiar de vista. Para
 * volver al fondo con la imagen del restaurante desenfocada basta pasar
 * `imageUrl={restaurant?.banner_url}` a `SheetBackdrop`.
 */
export default function FlowBackdrop() {
  const pathname = usePathname();
  const step = pathname.split("/").filter(Boolean)[1];
  const visible = BACKDROP_STEPS.includes(step ?? "");
  return <SheetBackdrop className={visible ? undefined : "hidden"} />;
}

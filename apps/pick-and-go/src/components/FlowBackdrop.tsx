"use client";

import { SheetBackdrop } from "@even/ui";
import { usePathname } from "next/navigation";

// Pasos del flujo de compra que se pintan sobre el fondo desenfocado.
const FLOW_STEPS = ["cart", "order-confirm", "card-selection", "add-card", "payment-success"];

/**
 * Fondo verde de marca compartido por todo el flujo (menos el menú). Vive en el
 * layout de [restaurantId], así que no se desmonta al cambiar de vista. Para
 * volver al fondo con la imagen del restaurante desenfocada basta pasar
 * `imageUrl={restaurant?.banner_url}` a `SheetBackdrop`.
 */
export default function FlowBackdrop() {
  const pathname = usePathname();
  const step = pathname.split("/").filter(Boolean)[1];
  const visible = FLOW_STEPS.includes(step ?? "");
  return <SheetBackdrop className={visible ? undefined : "hidden"} />;
}

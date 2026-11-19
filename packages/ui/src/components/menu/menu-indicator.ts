/** Qué indicador pinta el botón principal del menú. */
export type MenuIndicator = "cart" | "bill" | "none";

export type MenuIndicatorInput = {
  /** Artículos en el carrito. */
  cartCount?: number;
  /** Hay una cuenta (orden abierta sin pagar) en la mesa. */
  hasPendingBill?: boolean;
};

/**
 * Regla de prioridad del indicador del menú: el carrito gana a la cuenta pendiente.
 * Carrito con artículos → "cart"; si no, cuenta pendiente → "bill"; si no, "none".
 */
export function resolveMenuIndicator({ cartCount = 0, hasPendingBill = false }: MenuIndicatorInput): MenuIndicator {
  if (cartCount > 0) return "cart";
  if (hasPendingBill) return "bill";
  return "none";
}

/**
 * Hay platillos de la mesa sin pagar: es la definición de "cuenta pendiente" que comparten las apps con
 * cuenta abierta (FlexBill, Tap Order & Pay). Los platillos pagados no cuentan.
 */
export function hasUnpaidDishes(dishes: ReadonlyArray<{ payment_status?: string | null }> | null | undefined): boolean {
  return Array.isArray(dishes) && dishes.some((dish) => dish.payment_status !== "paid");
}

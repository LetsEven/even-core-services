import {
  addDishesToFlexBillBulk,
  updateOrderWaiter,
  type BulkDishItem,
  type OpenTableResult,
} from "./api";
import type { ComandaDraft, ComandaLine } from "../features/comanda/types";

// DEUDA: dishes/bulk (ver addDishesToFlexBillBulk) solo manda guestName e
// items; no hay campo orderNotes. Mientras el backend no lo acepte, las notas
// de la comanda viajan dentro de specialInstructions del primer renglón, para
// que salgan una sola vez en el ticket impreso de cocina.
export const MAX_NOTES_LENGTH = 300;

function lineToBulkItem(line: ComandaLine): BulkDishItem {
  return {
    item: line.name,
    quantity: line.quantity,
    price: line.unitPrice,
    extraPrice: line.extraPrice,
    customFields: line.customFields,
    // Siempre menuItemId: el backend imprime por estación con él.
    menuItemId: line.menuItemId,
    specialInstructions: line.specialInstructions,
    images: line.imageUrl ? [line.imageUrl] : [],
  };
}

export function draftToBulkItems(draft: ComandaDraft): BulkDishItem[] {
  const items = draft.lines.map(lineToBulkItem);
  const notes = draft.notes.trim().slice(0, MAX_NOTES_LENGTH);
  if (notes && items.length > 0) {
    const tag = `NOTA COMANDA: ${notes}`;
    const first = items[0];
    items[0] = {
      ...first,
      specialInstructions: first.specialInstructions
        ? `${first.specialInstructions} | ${tag}`
        : tag,
    };
  }
  return items;
}

export function guestNameFor(waiter: ComandaDraft["waiter"]): string {
  return waiter.id === "EVEN" ? "MESERO" : `MESERO - ${waiter.name}`;
}

// Envía la comanda: abre la cuenta si la mesa estaba libre o agrega a la
// existente (mismo endpoint). `claimWaiter` solo en cuenta nueva.
export async function sendComanda(
  draft: ComandaDraft,
  token: string,
  options: { claimWaiter: boolean },
): Promise<OpenTableResult> {
  const result = await addDishesToFlexBillBulk(
    {
      restaurantId: draft.restaurantId,
      branchNumber: draft.branchNumber,
      tableNumber: draft.unit,
      guestName: guestNameFor(draft.waiter),
      items: draftToBulkItems(draft),
    },
    token,
  );
  if (
    options.claimWaiter &&
    draft.waiter.id !== "EVEN" &&
    result.table_order_id
  ) {
    try {
      await updateOrderWaiter(
        result.table_order_id,
        "flex_bill",
        draft.waiter.name,
        draft.waiter.id,
        token,
      );
    } catch {
      // No bloquea el envío: se puede reclamar después desde la cuenta.
    }
  }
  return result;
}

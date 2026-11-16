import type { BulkDishItem } from "../../services/api";

export type Station = "kitchen" | "bar" | "other";

export type ComandaCustomFields = NonNullable<BulkDishItem["customFields"]>;

// Selecciones de personalización en edición: dropdown/checkboxes guardan
// ids de opción; dropdown-quantity guarda cantidad por opción.
export type CustomSelections = Record<
  string,
  string | string[] | Record<string, number>
>;

export interface ComandaLine {
  // Identificador local de la línea (no se manda al backend).
  key: string;
  menuItemId: number;
  name: string;
  quantity: number;
  // Precio base real (con descuento) y extra de personalizaciones. Nunca
  // incluyen comisión: el display se calcula aparte (ver pricing.ts).
  unitPrice: number;
  extraPrice: number;
  customFields: ComandaCustomFields;
  specialInstructions: string | null;
  imageUrl?: string | null;
}

export interface ComandaDraft {
  restaurantId: number;
  branchNumber: number;
  unit: string;
  waiter: { id: string; name: string };
  lines: ComandaLine[];
  notes: string;
}

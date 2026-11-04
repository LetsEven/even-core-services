import type { MenuItemCustomField } from "../services/api";

// Sin minSelections se conserva lo de antes: obligatorio = al menos 1
export function minSelectionsOf(field: MenuItemCustomField): number {
  if (field.type === "checkboxes" && (field.minSelections ?? 0) > 0)
    return field.minSelections as number;
  if (field.type === "dropdown" || field.type === "checkboxes")
    return field.required ? 1 : 0;
  return 0;
}

export function selectionHint(field: MenuItemCustomField): string {
  const max = field.maxSelections ?? 1;
  const min = field.minSelections ?? 0;
  if (min > 0 && min >= max) return `Elige ${max}`;
  if (min > 0) return `Elige de ${min} a ${max}`;
  return `Hasta ${max}`;
}

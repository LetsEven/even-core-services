import type { MenuItem } from "../../services/api";
import {
  getDisplaySubtotal,
  getItemDisplayPrice,
} from "../../utils/commissionCalculator";
import { minSelectionsOf } from "../../utils/customFields";
import type {
  ComandaCustomFields,
  ComandaLine,
  CustomSelections,
} from "./types";

export function basePriceOf(item: MenuItem): number {
  return item.discount > 0 ? item.price * (1 - item.discount / 100) : item.price;
}

export function extraPriceOf(
  item: MenuItem,
  selections: CustomSelections,
): number {
  let extra = 0;
  for (const field of item.custom_fields ?? []) {
    const sel = selections[field.id];
    if (field.type === "dropdown-quantity" && sel && !Array.isArray(sel)) {
      for (const [optId, qty] of Object.entries(sel as Record<string, number>)) {
        const opt = field.options?.find((o) => o.id === optId);
        if (opt && qty > 0) extra += opt.price * qty;
      }
    } else if (Array.isArray(sel)) {
      for (const optId of sel) {
        const opt = field.options?.find((o) => o.id === optId);
        if (opt) extra += opt.price;
      }
    }
  }
  return extra;
}

export function customFieldsOf(
  item: MenuItem,
  selections: CustomSelections,
): ComandaCustomFields {
  return (item.custom_fields ?? [])
    .map((field) => {
      const sel = selections[field.id];
      let selectedOptions: ComandaCustomFields[number]["selectedOptions"] = [];
      if (field.type === "dropdown-quantity" && sel && !Array.isArray(sel)) {
        selectedOptions = Object.entries(sel as Record<string, number>)
          .filter(([, q]) => q > 0)
          .flatMap(([optId, q]) => {
            const opt = field.options?.find((o) => o.id === optId);
            return opt
              ? [
                  {
                    optionId: opt.id,
                    optionName: opt.name,
                    price: opt.price,
                    quantity: q,
                  },
                ]
              : [];
          });
      } else if (Array.isArray(sel)) {
        selectedOptions =
          field.options
            ?.filter((o) => sel.includes(o.id))
            .map((o) => ({
              optionId: o.id,
              optionName: o.name,
              price: o.price,
              quantity: 1,
            })) ?? [];
      }
      return {
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.type,
        selectedOptions,
      };
    })
    .filter((f) => f.selectedOptions.length > 0);
}

export function isSelectionValid(
  item: MenuItem,
  selections: CustomSelections,
): boolean {
  for (const field of item.custom_fields ?? []) {
    const min = minSelectionsOf(field);
    if (min > 0) {
      const sel = selections[field.id];
      if (!Array.isArray(sel) || sel.length < min) return false;
    }
  }
  return true;
}

export function needsCustomization(item: MenuItem): boolean {
  return (item.custom_fields ?? []).length > 0;
}

export function buildLine(
  item: MenuItem,
  quantity: number,
  selections: CustomSelections,
  specialInstructions: string,
): Omit<ComandaLine, "key"> {
  return {
    menuItemId: item.id,
    name: item.name,
    quantity,
    unitPrice: basePriceOf(item),
    extraPrice: extraPriceOf(item, selections),
    customFields: customFieldsOf(item, selections),
    specialInstructions: specialInstructions.trim() || null,
    imageUrl: item.image_url,
  };
}

// Precio unitario que ve el mesero (comisión ya incrustada, si aplica).
export function lineDisplayUnit(line: ComandaLine): number {
  return getItemDisplayPrice(line.unitPrice + line.extraPrice);
}

export function lineDisplayTotal(line: ComandaLine): number {
  return getDisplaySubtotal([
    {
      price: line.unitPrice,
      extraPrice: line.extraPrice,
      quantity: line.quantity,
    },
  ]);
}

export function linesDisplayTotal(lines: ComandaLine[]): number {
  return getDisplaySubtotal(
    lines.map((l) => ({
      price: l.unitPrice,
      extraPrice: l.extraPrice,
      quantity: l.quantity,
    })),
  );
}

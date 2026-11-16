import { useMemo, useState } from "react";
import { Button, Modal, QuantityStepper, Textarea, cn } from "@even/ui";
import type { MenuItem, MenuItemCustomField } from "../../services/api";
import { getItemDisplayPrice } from "../../utils/commissionCalculator";
import { minSelectionsOf, selectionHint } from "../../utils/customFields";
import {
  basePriceOf,
  buildLine,
  extraPriceOf,
  isSelectionValid,
} from "./pricing";
import type { ComandaLine, CustomSelections } from "./types";

interface Props {
  item: MenuItem;
  onClose: () => void;
  onAdd: (line: Omit<ComandaLine, "key">) => void;
}

const money = (n: number) => `$${n.toFixed(2)}`;

// El padre monta esta hoja con `key={item.id}` para reiniciar el estado.
export default function CustomizeSheet({ item, onClose, onAdd }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<CustomSelections>({});
  const [instructions, setInstructions] = useState("");

  const unit = basePriceOf(item) + extraPriceOf(item, selections);
  const multiplier = unit > 0 ? getItemDisplayPrice(unit) / unit : 1;
  const valid = isSelectionValid(item, selections);
  const total = useMemo(
    () => getItemDisplayPrice(unit) * quantity,
    [unit, quantity],
  );

  function pickOne(fieldId: string, optionId: string) {
    setSelections((prev) => {
      const current = (prev[fieldId] as string[] | undefined) ?? [];
      return { ...prev, [fieldId]: current.includes(optionId) ? [] : [optionId] };
    });
  }

  function toggle(field: MenuItemCustomField, optionId: string) {
    setSelections((prev) => {
      const current = (prev[field.id] as string[] | undefined) ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [field.id]: current.filter((i) => i !== optionId) };
      }
      if (current.length >= (field.maxSelections ?? 1)) return prev;
      return { ...prev, [field.id]: [...current, optionId] };
    });
  }

  function setOptionQty(fieldId: string, optionId: string, qty: number) {
    setSelections((prev) => {
      const current = { ...((prev[fieldId] as Record<string, number>) ?? {}) };
      if (qty > 0) current[optionId] = qty;
      else delete current[optionId];
      return { ...prev, [fieldId]: current };
    });
  }

  function submit() {
    if (!valid) return;
    onAdd(buildLine(item, quantity, selections, instructions));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      footer={
        <Button fullWidth disabled={!valid} onClick={submit}>
          Agregar · {money(total)}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-tone-700">Cantidad</span>
          <QuantityStepper
            variant="boxed"
            value={quantity}
            min={1}
            onIncrement={() => setQuantity((q) => q + 1)}
            onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
            labels={{ increment: "Más", decrement: "Menos" }}
          />
        </div>

        {(item.custom_fields ?? []).map((field) => (
          <fieldset key={field.id} className="rounded-xl border border-stroke-soft">
            <legend className="sr-only">{field.name}</legend>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm font-medium text-even-evergreen">
                {field.name}
              </span>
              <span className="text-xs text-tone-500">
                {minSelectionsOf(field) > 0 && "Requerido · "}
                {field.type === "checkboxes" && selectionHint(field)}
              </span>
            </div>
            {(field.options ?? []).map((opt) => {
              const sel = selections[field.id];
              const price = opt.price > 0 ? `+${money(opt.price * multiplier)}` : "";
              const row = "flex w-full items-center justify-between gap-3 border-t border-stroke-soft px-3 py-3 text-left";

              if (field.type === "dropdown-quantity") {
                const qty =
                  sel && !Array.isArray(sel)
                    ? ((sel as Record<string, number>)[opt.id] ?? 0)
                    : 0;
                return (
                  <div key={opt.id} className={cn(row, opt.agotado && "opacity-40")}>
                    <span className="text-sm">
                      {opt.name}{" "}
                      <span className="text-xs text-tone-500">
                        {opt.agotado ? "Agotado" : price}
                      </span>
                    </span>
                    <QuantityStepper
                      variant="compact"
                      value={qty}
                      min={0}
                      disabled={opt.agotado}
                      onIncrement={() => setOptionQty(field.id, opt.id, qty + 1)}
                      onDecrement={() => setOptionQty(field.id, opt.id, qty - 1)}
                      labels={{ increment: `Más ${opt.name}`, decrement: `Menos ${opt.name}` }}
                    />
                  </div>
                );
              }

              const selected = Array.isArray(sel) && sel.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={opt.agotado}
                  aria-pressed={selected}
                  onClick={() =>
                    field.type === "checkboxes"
                      ? toggle(field, opt.id)
                      : pickOne(field.id, opt.id)
                  }
                  className={cn(
                    row,
                    "min-h-11 disabled:opacity-40",
                    selected && "bg-even-grass/20",
                  )}
                >
                  <span className="text-sm">
                    {opt.name}{" "}
                    <span className="text-xs text-tone-500">
                      {opt.agotado ? "Agotado" : price}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 border-2 border-even-evergreen",
                      field.type === "checkboxes" ? "rounded" : "rounded-full",
                      selected && "bg-even-evergreen",
                    )}
                  />
                </button>
              );
            })}
          </fieldset>
        ))}

        <Textarea
          label="Instrucciones especiales"
          rows={2}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Sin cebolla, término medio..."
        />
      </div>
    </Modal>
  );
}

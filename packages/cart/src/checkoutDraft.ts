/**
 * Lo que el cliente ya eligió en el flujo de compra (propina), en memoria, para
 * que al volver de "pago" a "confirmación" se vea igual y al instante en lugar
 * de reiniciarse al valor por defecto. `scope` identifica el restaurante (y
 * sucursal) para no mezclar elecciones; se descarta al pagar.
 */
export interface CheckoutDraft {
  scope: string;
  tipPercentage: number;
  customTip: string;
  showCustomTipInput: boolean;
}

export const DEFAULT_TIP_PERCENTAGE = 10;

let draft: CheckoutDraft | null = null;

export function readCheckoutDraft(scope: string | undefined): CheckoutDraft | null {
  return draft && scope && draft.scope === scope ? draft : null;
}

export function writeCheckoutDraft(next: CheckoutDraft) {
  draft = next;
}

export function clearCheckoutDraft() {
  draft = null;
}

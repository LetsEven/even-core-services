export interface CommissionRates {
  evenTotal: number;
  clientPays: number;
  restaurantPays: number;
}

export interface CommissionBreakdown {
  baseAmount: number;
  tipAmount: number;
  ivaTip: number;
  subtotalForCommission: number;
  evenCommissionTotal: number;
  evenCommissionClient: number;
  evenCommissionRestaurant: number;
  ivaEvenTotal: number;
  ivaEvenClient: number;
  ivaEvenRestaurant: number;
  evenClientCharge: number;
  evenRestaurantCharge: number;
  totalAmountCharged: number;
  even_rate_applied: number;
  rates: CommissionRates;
}

export function getCommissionRates(amount: number): CommissionRates {
  if (amount >= 20 && amount <= 30) {
    return { evenTotal: 11.0, clientPays: 9.0, restaurantPays: 2.0 };
  } else if (amount >= 31 && amount <= 49) {
    return { evenTotal: 8.0, clientPays: 6.0, restaurantPays: 2.0 };
  } else if (amount >= 50 && amount <= 100) {
    return { evenTotal: 5.8, clientPays: 3.8, restaurantPays: 2.0 };
  } else if (amount >= 101 && amount <= 150) {
    return { evenTotal: 4.2, clientPays: 2.2, restaurantPays: 2.0 };
  } else if (amount > 150) {
    return { evenTotal: 4.0, clientPays: 2.0, restaurantPays: 2.0 };
  } else {
    return { evenTotal: 11.0, clientPays: 9.0, restaurantPays: 2.0 };
  }
}

export function calculateCommissions(
  baseAmount: number,
  tipAmount: number,
): CommissionBreakdown {
  const ivaTip = tipAmount * 0.16;
  const subtotalForCommission = baseAmount + tipAmount;
  const rates = getCommissionRates(subtotalForCommission);

  const evenCommissionTotal = subtotalForCommission * (rates.evenTotal / 100);
  const evenCommissionClient = subtotalForCommission * (rates.clientPays / 100);
  const evenCommissionRestaurant =
    subtotalForCommission * (rates.restaurantPays / 100);

  const ivaEvenTotal = evenCommissionTotal * 0.16;
  const ivaEvenClient = evenCommissionClient * 0.16;
  const ivaEvenRestaurant = evenCommissionRestaurant * 0.16;

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const evenClientCharge = r2(evenCommissionClient + ivaEvenClient);
  const evenRestaurantCharge = r2(evenCommissionRestaurant + ivaEvenRestaurant);

  const totalAmountCharged = r2(baseAmount + tipAmount + evenClientCharge);

  const even_rate_applied =
    subtotalForCommission > 0
      ? r2((evenCommissionTotal / subtotalForCommission) * 100)
      : 0;

  return {
    baseAmount,
    tipAmount,
    ivaTip,
    subtotalForCommission,
    evenCommissionTotal,
    evenCommissionClient,
    evenCommissionRestaurant,
    ivaEvenTotal,
    ivaEvenClient,
    ivaEvenRestaurant,
    evenClientCharge,
    evenRestaurantCharge,
    totalAmountCharged,
    even_rate_applied,
    rates,
  };
}

// ============================================================
// Comisión por ítem — exclusivo de Flex Bill (usado solo por
// CashPaymentModal.tsx cuando !isTapPay). Espejo de
// even-flexbill/app/utils/commissionCalculator.ts. No toca
// getCommissionRates/calculateCommissions de arriba, que siguen
// usando la rama Tap Pay de CashPaymentModal.tsx sin cambios.
// ============================================================

export interface ItemCommissionRate {
  clientPays: number;
  restaurantPays: number;
}

export function getItemCommissionRate(unitPrice: number): ItemCommissionRate {
  if (unitPrice <= 40) {
    return { clientPays: 2.2, restaurantPays: 2.0 };
  }
  return { clientPays: 2.0, restaurantPays: 2.0 };
}

// Precio que ve el cliente: precio real + comisión del cliente + IVA sobre
// esa comisión, ya incrustados.
export function getItemDisplayPrice(unitPrice: number): number {
  const rate = getItemCommissionRate(unitPrice);
  const commission = unitPrice * (rate.clientPays / 100);
  const iva = commission * 0.16;
  return Math.round((unitPrice + commission + iva) * 100) / 100;
}

export interface FlexBillCommissionLineItem {
  price: number;
  extraPrice?: number;
  quantity: number;
}

function computeItemCommissionTotals(items: FlexBillCommissionLineItem[]) {
  let baseAmount = 0;
  let evenCommissionClient = 0;
  let evenCommissionRestaurant = 0;

  for (const item of items) {
    const quantity = item.quantity || 1;
    const unitPrice = item.price + (item.extraPrice || 0);
    const rate = getItemCommissionRate(unitPrice);
    const lineBase = unitPrice * quantity;

    baseAmount += lineBase;
    evenCommissionClient += lineBase * (rate.clientPays / 100);
    evenCommissionRestaurant += lineBase * (rate.restaurantPays / 100);
  }

  return { baseAmount, evenCommissionClient, evenCommissionRestaurant };
}

// La tasa % de cada ítem se determinó por su propio precio (arriba), pero
// el monto en pesos se cobra sobre consumo + propina — usando el promedio
// ponderado que resultó de tarifar cada ítem individualmente.
function finalizeItemCommission(
  totals: {
    baseAmount: number;
    evenCommissionClient: number;
    evenCommissionRestaurant: number;
  },
  tipAmount: number,
): CommissionBreakdown {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const { baseAmount, evenCommissionClient, evenCommissionRestaurant } = totals;

  const blendedClientRate =
    baseAmount > 0 ? evenCommissionClient / baseAmount : 0;
  const blendedRestaurantRate =
    baseAmount > 0 ? evenCommissionRestaurant / baseAmount : 0.02;

  const subtotalForCommission = baseAmount + tipAmount;
  const finalCommissionClient = subtotalForCommission * blendedClientRate;
  const finalCommissionRestaurant =
    subtotalForCommission * blendedRestaurantRate;

  const evenCommissionTotal = finalCommissionClient + finalCommissionRestaurant;
  const ivaEvenClient = finalCommissionClient * 0.16;
  const ivaEvenRestaurant = finalCommissionRestaurant * 0.16;
  const ivaTip = tipAmount * 0.16;

  const evenClientCharge = r2(finalCommissionClient + ivaEvenClient);
  const evenRestaurantCharge = r2(
    finalCommissionRestaurant + ivaEvenRestaurant,
  );
  const totalAmountCharged = r2(baseAmount + tipAmount + evenClientCharge);
  const even_rate_applied =
    subtotalForCommission > 0
      ? r2((evenCommissionTotal / subtotalForCommission) * 100)
      : 0;

  return {
    baseAmount: r2(baseAmount),
    tipAmount: r2(tipAmount),
    ivaTip,
    subtotalForCommission: r2(subtotalForCommission),
    evenCommissionTotal,
    evenCommissionClient: finalCommissionClient,
    evenCommissionRestaurant: finalCommissionRestaurant,
    ivaEvenTotal: evenCommissionTotal * 0.16,
    ivaEvenClient,
    ivaEvenRestaurant,
    evenClientCharge,
    evenRestaurantCharge,
    totalAmountCharged,
    even_rate_applied,
    rates: {
      evenTotal: even_rate_applied,
      clientPays: blendedClientRate * 100,
      restaurantPays: blendedRestaurantRate * 100,
    },
  };
}

// full-bill / select-items: ítems exactos conocidos.
export function calculateFlexBillItemCommission(
  items: FlexBillCommissionLineItem[],
  tipAmount: number,
): CommissionBreakdown {
  return finalizeItemCommission(computeItemCommissionTotals(items), tipAmount);
}

// choose-amount: fracción del total real pendiente de la mesa.
export function calculateFlexBillProportionalCommission(
  items: FlexBillCommissionLineItem[],
  fraction: number,
  tipAmount: number,
): CommissionBreakdown {
  const totals = computeItemCommissionTotals(items);
  return finalizeItemCommission(
    {
      baseAmount: totals.baseAmount * fraction,
      evenCommissionClient: totals.evenCommissionClient * fraction,
      evenCommissionRestaurant: totals.evenCommissionRestaurant * fraction,
    },
    tipAmount,
  );
}

// Subtotal fijo a mostrar: consumo + su propia comisión, redondeando POR
// ÍTEM (precio × cantidad, cada línea redondeada) y sumando — el mismo
// método que ya usa el backend para total_display_price/totalDisplayAmount
// (ver flexBillService.js/kitchenService.js, que es lo que muestra
// OrderCard). Sumar dos totales ya redondeados por separado (base +
// comisión) puede dar un centavo distinto a ese método.
export function getDisplaySubtotal(items: FlexBillCommissionLineItem[]): number {
  let total = 0;
  for (const item of items) {
    const unitPrice = item.price + (item.extraPrice || 0);
    const displayPrice = getItemDisplayPrice(unitPrice);
    total += Math.round(displayPrice * (item.quantity || 1) * 100) / 100;
  }
  return Math.round(total * 100) / 100;
}

// Igual que getDisplaySubtotal, pero para cobros que representan una
// fracción de la mesa (choose-amount) — no hay ítems propios que redondear
// uno por uno, así que se aplica la fracción sobre el subtotal ya
// correctamente redondeado de TODOS los ítems pendientes de la mesa.
export function getDisplaySubtotalForFraction(
  allTableItems: FlexBillCommissionLineItem[],
  fraction: number,
): number {
  return Math.round(getDisplaySubtotal(allTableItems) * fraction * 100) / 100;
}

// Dado un monto que se quiere ver como "Propina" (ya con su propia comisión
// incrustada — ej. el mesero tecleó $50 y quiere ver exactamente $50, o
// eligió 10% del subtotal), resuelve qué propina real hay que mandar al
// cálculo de comisión para que Total - Subtotal fijo cierre exacto contra
// ese monto. `computeBreakdown` es la misma función que ya arma el
// breakdown real según el tipo de cobro — se reutiliza tal cual.
export function resolveTipAmountForTargetDisplay(
  computeBreakdown: (tipAmount: number) => CommissionBreakdown,
  displaySubtotal: number,
  targetDisplayPropina: number,
): number {
  if (targetDisplayPropina <= 0) return 0;

  const zeroTip = computeBreakdown(0);
  const blendedClientRate =
    zeroTip.baseAmount > 0
      ? zeroTip.evenCommissionClient / zeroTip.baseAmount
      : 0;
  const factor = 1 + blendedClientRate * 1.16;

  let tipAmount = factor > 0 ? targetDisplayPropina / factor : targetDisplayPropina;
  tipAmount = Math.max(Math.round(tipAmount * 100) / 100, 0);

  for (let i = 0; i < 3; i++) {
    const breakdown = computeBreakdown(tipAmount);
    const displayPropina =
      Math.round((breakdown.totalAmountCharged - displaySubtotal) * 100) /
      100;
    const diff =
      Math.round((targetDisplayPropina - displayPropina) * 100) / 100;
    if (diff === 0) break;
    tipAmount = Math.max(Math.round((tipAmount + diff) * 100) / 100, 0);
  }

  return tipAmount;
}

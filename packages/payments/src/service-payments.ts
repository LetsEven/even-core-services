// Comisiones por servicio ligadas a un `service`: reemplaza los
// commissionCalculator.ts que cada app copiaba. Las tarifas siguen viviendo
// solo en SERVICE_COMMISSION_RATES (commissions.ts); aquí no hay ninguna.
// Solo PREVIEW en pantalla: el backend recalcula y es la autoridad del cobro.
// Ver docs/comisiones.md.
import {
  calculateCommissions,
  getCommissionRates,
  IVA_FACTOR,
  IVA_RATE,
  type CommissionBreakdown,
  type CommissionRates,
  type CommissionService,
} from "./commissions";

export interface ItemCommissionRate {
  clientPays: number;
  restaurantPays: number;
}

/** Línea de ítem para los subtotales a mostrar y las comisiones por ítem. */
export interface CommissionLineItem {
  price: number;
  extraPrice?: number;
  quantity: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function createServicePayments(service: CommissionService) {
  /** Tarifa del servicio (el monto se conserva por compatibilidad con los callers). */
  function ratesFor(amount: number): CommissionRates {
    return getCommissionRates(amount, service);
  }

  function breakdown(baseAmount: number, tipAmount: number): CommissionBreakdown {
    return calculateCommissions(baseAmount, tipAmount, service);
  }

  // Tarifa fija por ítem (antes había un tramo para ítems <= $40; `_unitPrice`
  // se conserva por compatibilidad con los callers).
  function getItemCommissionRate(_unitPrice: number): ItemCommissionRate {
    const { clientPays, restaurantPays } = ratesFor(0);
    return { clientPays, restaurantPays };
  }

  // Precio que ve el cliente: precio real + comisión del cliente + IVA sobre
  // esa comisión. Con 0 % cliente es el precio real (regla 1 de docs/comisiones.md).
  function getItemDisplayPrice(unitPrice: number): number {
    const rate = getItemCommissionRate(unitPrice);
    const commission = unitPrice * (rate.clientPays / 100);
    const iva = commission * IVA_RATE;
    return r2(unitPrice + commission + iva);
  }

  // Subtotal fijo a mostrar: consumo + su propia comisión, redondeando POR
  // ÍTEM (precio x cantidad, cada línea redondeada) y sumando — sumar dos
  // totales ya redondeados por separado puede dar un centavo distinto.
  function getDisplaySubtotal(items: CommissionLineItem[]): number {
    let total = 0;
    for (const item of items) {
      const unitPrice = item.price + (item.extraPrice || 0);
      const displayPrice = getItemDisplayPrice(unitPrice);
      total += r2(displayPrice * (item.quantity || 1));
    }
    return r2(total);
  }

  // Igual que getDisplaySubtotal, pero para pagos que son una fracción de la
  // mesa (equal-shares/choose-amount): se aplica la fracción sobre el subtotal
  // ya redondeado de TODOS los ítems.
  function getDisplaySubtotalForFraction(
    allTableItems: CommissionLineItem[],
    fraction: number,
  ): number {
    return r2(getDisplaySubtotal(allTableItems) * fraction);
  }

  // Propina que ve el comensal: lo que le falta al Subtotal para llegar al
  // Total cobrado. No es el `tipAmount` real que se cobra.
  function getDisplayTip(totalAmount: number, displaySubtotal: number): number {
    return r2(totalAmount - displaySubtotal);
  }

  // Dado un monto que el cliente quiere ver como "Propina" (con su comisión
  // incrustada), despeja la propina real que hay que mandar al cálculo de
  // comisión para que Total - Subtotal cierre contra ese monto.
  // `computeBreakdown` arma el breakdown real para una propina dada.
  function resolveTipAmountForTargetDisplay(
    computeBreakdown: (tipAmount: number) => CommissionBreakdown,
    displaySubtotal: number,
    targetDisplayPropina: number,
  ): number {
    if (targetDisplayPropina <= 0) return 0;

    const zeroTip = computeBreakdown(0);
    const blendedClientRate =
      zeroTip.baseAmount > 0 ? zeroTip.evenCommissionClient / zeroTip.baseAmount : 0;
    const factor = 1 + blendedClientRate * IVA_FACTOR;

    let tipAmount = factor > 0 ? targetDisplayPropina / factor : targetDisplayPropina;
    tipAmount = Math.max(r2(tipAmount), 0);

    // Corrección por redondeo: el residuo (Total - Subtotal) puede quedar a un
    // centavo del objetivo; converge en 1-2 vueltas (la relación es casi lineal).
    for (let i = 0; i < 3; i++) {
      const b = computeBreakdown(tipAmount);
      const displayPropina = r2(b.totalAmountCharged - displaySubtotal);
      const diff = r2(targetDisplayPropina - displayPropina);
      if (diff === 0) break;
      tipAmount = Math.max(r2(tipAmount + diff), 0);
    }

    return tipAmount;
  }

  // ---- Comisión por ítem / fracción (FlexBill y Tap & Pay: cuenta dividida) ----

  function computeItemCommissionTotals(items: CommissionLineItem[]) {
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

  function finalizeItemCommission(
    totals: { baseAmount: number; evenCommissionClient: number; evenCommissionRestaurant: number },
    tipAmount: number,
  ): CommissionBreakdown {
    const { baseAmount, evenCommissionClient, evenCommissionRestaurant } = totals;

    // La tasa % de cada ítem se determinó por su propio precio, pero el monto
    // en pesos se cobra sobre consumo + propina usando el promedio ponderado.
    // Sin base, la tasa de respaldo del restaurante sale de la tabla del servicio.
    const blendedClientRate = baseAmount > 0 ? evenCommissionClient / baseAmount : 0;
    const blendedRestaurantRate =
      baseAmount > 0 ? evenCommissionRestaurant / baseAmount : ratesFor(0).restaurantPays / 100;

    const subtotalForCommission = baseAmount + tipAmount;
    const finalCommissionClient = subtotalForCommission * blendedClientRate;
    const finalCommissionRestaurant = subtotalForCommission * blendedRestaurantRate;

    const evenCommissionTotal = finalCommissionClient + finalCommissionRestaurant;
    const ivaEvenClient = finalCommissionClient * IVA_RATE;
    const ivaEvenRestaurant = finalCommissionRestaurant * IVA_RATE;
    const ivaTip = tipAmount * IVA_RATE;

    const evenClientCharge = r2(finalCommissionClient + ivaEvenClient);
    const evenRestaurantCharge = r2(finalCommissionRestaurant + ivaEvenRestaurant);
    const totalAmountCharged = r2(baseAmount + tipAmount + evenClientCharge);
    const evenRateApplied =
      subtotalForCommission > 0 ? (evenCommissionTotal / subtotalForCommission) * 100 : 0;

    return {
      baseAmount: r2(baseAmount),
      tipAmount: r2(tipAmount),
      ivaTip,
      subtotalForCommission: r2(subtotalForCommission),
      evenCommissionTotal,
      evenCommissionClient: finalCommissionClient,
      evenCommissionRestaurant: finalCommissionRestaurant,
      ivaEvenTotal: evenCommissionTotal * IVA_RATE,
      ivaEvenClient,
      ivaEvenRestaurant,
      evenClientCharge,
      evenRestaurantCharge,
      totalAmountCharged,
      rates: {
        evenTotal: evenRateApplied,
        clientPays: blendedClientRate * 100,
        restaurantPays: blendedRestaurantRate * 100,
      },
    };
  }

  // full-bill / select-items: ítems exactos conocidos.
  function calculateItemCommission(items: CommissionLineItem[], tipAmount: number): CommissionBreakdown {
    return finalizeItemCommission(computeItemCommissionTotals(items), tipAmount);
  }

  // equal-shares / choose-amount: fracción del total real de la mesa.
  function calculateProportionalCommission(
    items: CommissionLineItem[],
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

  return {
    service,
    getCommissionRates: ratesFor,
    calculateCommissions: breakdown,
    getItemCommissionRate,
    getItemDisplayPrice,
    getDisplaySubtotal,
    getDisplaySubtotalForFraction,
    getDisplayTip,
    resolveTipAmountForTargetDisplay,
    calculateItemCommission,
    calculateProportionalCommission,
  };
}

export type ServicePayments = ReturnType<typeof createServicePayments>;

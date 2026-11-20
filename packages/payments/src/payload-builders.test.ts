// Los builders deben generar EXACTAMENTE los payloads que armaba cada app
// (Fase 4.5). Los snapshots e2e de apps/*/e2e/payload-contract.spec.ts prueban
// lo mismo contra la página real; aquí se fijan los literales por app.
import { describe, expect, it } from "vitest";
import { buildChargeRequest } from "./charge-request";
import { calculateCommissions } from "./commissions";
import { toTransactionRecord } from "./transaction-record";

const wire = (v: unknown) => JSON.parse(JSON.stringify(v));
const item = { name: "Club sándwich", price: 180, quantity: 2, extraPrice: 0, cartItemId: "ci_1" };

describe("buildChargeRequest", () => {
  it("Room Service", () => {
    expect(
      wire(
        buildChargeRequest({
          service: "room-service",
          paymentMethodId: "pm_1",
          amount: 405.19,
          description: "Pago Mesa 40 - Ana",
          orderId: "order-1",
          roomNumber: "40",
          restaurantId: "4",
          installments: null,
          baseAmount: 360,
          tipAmount: 36,
          discount: null,
          items: [item],
        }),
      ),
    ).toEqual({
      paymentMethodId: "pm_1",
      amount: 405.19,
      currency: "MXN",
      description: "Pago Mesa 40 - Ana",
      orderId: "order-1",
      roomNumber: "40",
      restaurantId: "4",
      baseAmount: 360,
      tipAmount: 36,
      service: "room-service",
      items: [item],
    });
  });

  it("Pick & Go con MSI y descuento personal: sin items, installments y userDiscountId", () => {
    expect(
      wire(
        buildChargeRequest({
          service: "pick-and-go",
          paymentMethodId: "pm_1",
          amount: 405.19,
          description: "Pick & Go Order - Ana",
          orderId: "order-1",
          tableNumber: "PICKUP",
          restaurantId: "4",
          installments: 6,
          baseAmount: 360,
          tipAmount: 36,
          discount: { source: "personal", id: "d1" },
          items: undefined,
        }),
      ),
    ).toEqual({
      paymentMethodId: "pm_1",
      amount: 405.19,
      currency: "MXN",
      description: "Pick & Go Order - Ana",
      orderId: "order-1",
      tableNumber: "PICKUP",
      restaurantId: "4",
      installments: 6,
      baseAmount: 360,
      tipAmount: 36,
      userDiscountId: "d1",
      service: "pick-and-go",
    });
  });

  it("Tap Order & Pay con descuento promo y orderType", () => {
    const r = wire(
      buildChargeRequest({
        service: "tap-order-and-pay",
        orderType: "tap-order-pay",
        paymentMethodId: "pm_1",
        amount: 396,
        description: "Pago Mesa 12 - Ana",
        orderId: "order-1",
        tableNumber: "12",
        restaurantId: "4",
        baseAmount: 360,
        tipAmount: 36,
        discount: { source: "promo", id: "p1" },
        items: [item],
      }),
    );
    expect(r).toMatchObject({ orderType: "tap-order-pay", promoRedemptionId: "p1", service: "tap-order-and-pay" });
    expect(r.userDiscountId).toBeUndefined();
  });

  it("FlexBill: sin service, id_table_order null se conserva y selected_item_ids ausente", () => {
    const r = wire(
      buildChargeRequest({
        service: undefined,
        paymentMethodId: "pm_1",
        amount: 396,
        description: "d",
        orderId: "o",
        tableNumber: "12",
        restaurantId: "4",
        baseAmount: 360,
        tipAmount: 36,
        order: { id_table_order: null, payment_type: "full-bill", selected_item_ids: undefined },
      }),
    );
    expect(r).toEqual({
      paymentMethodId: "pm_1",
      amount: 396,
      currency: "MXN",
      description: "d",
      orderId: "o",
      tableNumber: "12",
      restaurantId: "4",
      baseAmount: 360,
      tipAmount: 36,
      id_table_order: null,
      payment_type: "full-bill",
    });
    expect("service" in r).toBe(false);
  });

  it("Tap & Pay: id_tap_pay_order, payment_type y selected_item_ids", () => {
    expect(
      wire(
        buildChargeRequest({
          service: undefined,
          paymentMethodId: "pm_1",
          amount: 396,
          description: "d",
          orderId: "o",
          tableNumber: "1",
          restaurantId: "5",
          baseAmount: 360,
          tipAmount: 36,
          order: { id_tap_pay_order: "t1", payment_type: "select-items", selected_item_ids: ["a", "b"] },
        }),
      ),
    ).toMatchObject({ id_tap_pay_order: "t1", payment_type: "select-items", selected_item_ids: ["a", "b"] });
  });

  it("nunca modifica montos: base, propina y total viajan tal cual", () => {
    const r = buildChargeRequest({
      service: "pick-and-go",
      paymentMethodId: "pm",
      amount: 405.19,
      description: "d",
      orderId: "o",
      restaurantId: "1",
      baseAmount: 33.333,
      tipAmount: 5.025,
    });
    expect([r.amount, r.baseAmount, r.tipAmount]).toEqual([405.19, 33.333, 5.025]);
  });
});

describe("toTransactionRecord", () => {
  // Fórmulas inline que usaban FlexBill y Tap & Pay.
  function legacy(base: number, tip: number, service: "flex-bill" | "tap-and-pay", total: number) {
    const c = calculateCommissions(base, tip, service);
    const evenClientCharge = c.evenCommissionClient + c.ivaEvenClient;
    const ivaEvenRestaurant = c.evenCommissionRestaurant * 0.16;
    const evenRestaurantCharge = c.evenCommissionRestaurant + ivaEvenRestaurant;
    const subtotalForCommission = base + tip;
    const evenRateApplied = subtotalForCommission > 0 ? (c.evenCommissionTotal / subtotalForCommission) * 100 : 0;
    return {
      base_amount: base,
      tip_amount: tip,
      iva_tip: c.ivaTip,
      even_commission_total: c.evenCommissionTotal,
      even_commission_client: c.evenCommissionClient,
      even_commission_restaurant: c.evenCommissionRestaurant,
      iva_even_client: c.ivaEvenClient,
      iva_even_restaurant: ivaEvenRestaurant,
      even_client_charge: evenClientCharge,
      even_restaurant_charge: evenRestaurantCharge,
      even_rate_applied: evenRateApplied,
      total_amount_charged: total,
      subtotal_for_commission: subtotalForCommission,
    };
  }

  it.each(["flex-bill", "tap-and-pay"] as const)("%s: mismos números que las fórmulas inline", (service) => {
    for (const [base, tip] of [[0, 0], [100, 10], [360, 36], [33.33, 0], [1234.56, 123.45], [199.99, 29.9985]] as const) {
      const rec = toTransactionRecord({
        breakdown: calculateCommissions(base, tip, service),
        chargedTotal: base + tip,
        paymentMethodId: "pm",
        restaurantId: 4,
        ecartpayOrderId: "ep",
        paymentSource: "saved_card",
        transactionBy: "Ana",
        order: { id_tap_pay_order: "t1" },
      });
      expect(rec).toMatchObject(legacy(base, tip, service, base + tip));
      expect(rec.currency).toBe("MXN");
    }
  });

  it("los cargos Even van sin redondear y el desglose del servidor manda campo por campo (FlexBill)", () => {
    const b = calculateCommissions(360, 36, "flex-bill");
    const rec = toTransactionRecord({
      breakdown: b,
      chargedTotal: 433.73,
      paymentMethodId: null,
      restaurantId: 4,
      ecartpayOrderId: "ep",
      paymentSource: "apple_pay",
      transactionBy: "Invitado",
      order: { id_table_order: "to1", id_tap_orders_and_pay: null, payment_type: "full-bill", selected_item_ids: undefined },
      serverBreakdown: { base_amount: 359.5, even_restaurant_charge: 18.35 },
    });
    expect(rec.even_restaurant_charge).toBe(18.35);
    expect(rec.base_amount).toBe(359.5);
    expect(rec.tip_amount).toBe(36);
    expect(rec.even_client_charge).toBe(0);
    expect(rec.total_amount_charged).toBe(433.73);
    expect(wire(rec).id_tap_orders_and_pay).toBeNull();
    expect(wire(rec).selected_item_ids).toBeUndefined();
    expect(b.evenRestaurantCharge).toBe(18.37); // el del breakdown está redondeado; el reporte no
    expect(toTransactionRecord({ ...{ breakdown: b, chargedTotal: 396, paymentMethodId: "pm", restaurantId: 4, ecartpayOrderId: null, paymentSource: null, transactionBy: undefined, order: {} } }).even_restaurant_charge).toBe(18.3744);
  });
});

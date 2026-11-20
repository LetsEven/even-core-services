import { describe, expect, it, vi } from "vitest";
import { createPaymentIntentStore, type FingerprintInput } from "./idempotency";
import { createSavedCardCharge, type SavedCardChargeOptions } from "./saved-card-charge";
import { fakeClock, memoryStorage } from "./test/helpers";

const cart: FingerprintInput = { items: [{ menuItemId: "m1", quantity: 1 }], tipAmount: 0, total: 100 };
const request = { paymentMethodId: "pm_1", amount: 100, currency: "MXN", description: "t", orderId: "o", restaurantId: "1" };

function setup(over: Partial<SavedCardChargeOptions<{ id: string }, { n: number }>> & { process?: unknown[] } = {}) {
  const storage = memoryStorage();
  const store = createPaymentIntentStore({ storage: () => storage });
  const processPayment = vi.fn();
  for (const r of over.process ?? [{ success: true, payment: { id: "ep_1" } }]) processPayment.mockResolvedValueOnce(r);
  const getPaymentIntentStatus = vi.fn().mockResolvedValue({ success: true, status: "charging" });
  const confirm = vi.fn();
  const c = createSavedCardCharge<{ id: string }, { n: number }>(() => ({
    paymentService: { processPayment, getPaymentIntentStatus } as never,
    store,
    confirm,
    poll: fakeClock(),
    ...over,
  }));
  return { c, store, processPayment, getPaymentIntentStatus, confirm };
}

describe("createSavedCardCharge", () => {
  it("charge usa el store inyectado y guarda el id", async () => {
    const { c, store, processPayment } = setup();
    expect(await c.charge({ fingerprintInput: cart, request })).toMatchObject({ status: "charged", ecartpayOrderId: "ep_1" });
    expect(processPayment).toHaveBeenCalledOnce();
    expect(store.get()?.ecartpayOrderId).toBe("ep_1");
  });

  it("extractOrderId permite leer data.orderId (Room Service) sin cambiar el valor por defecto", async () => {
    const roomShape = [{ success: true, data: { orderId: "ep_room" } }];
    const withFallback = setup({
      process: roomShape,
      extractOrderId: (r) => r.payment?.id ?? (r as { data?: { orderId?: string } }).data?.orderId,
    });
    expect(await withFallback.c.charge({ fingerprintInput: cart, request })).toMatchObject({ ecartpayOrderId: "ep_room" });
    const byDefault = setup({ process: roomShape });
    expect(await byDefault.c.charge({ fingerprintInput: cart, request })).toEqual({ status: "retryable", reason: "missing_order_id" });
  });

  it("payment_in_progress avisa onVerifying, solo hace polling y nunca re-llama /payments", async () => {
    const { c, processPayment, getPaymentIntentStatus } = setup({ process: [{ success: false, code: "payment_in_progress" }] });
    getPaymentIntentStatus.mockResolvedValueOnce({ success: true, status: "charged", ecartpay_order_id: "ep_9" });
    const onVerifying = vi.fn();
    expect(await c.charge({ fingerprintInput: cart, request, onVerifying })).toMatchObject({ ecartpayOrderId: "ep_9" });
    expect(onVerifying).toHaveBeenCalledOnce();
    expect(processPayment).toHaveBeenCalledOnce();
  });

  it("confirm evalúa buildBody en cada intento y usa el predicado de la app", async () => {
    let n = 0;
    const { c, confirm } = setup({ isConfirmRetryable: (r) => r.status === 503 });
    confirm
      .mockResolvedValueOnce({ success: false, status: 503 })
      .mockResolvedValueOnce({ success: true, data: { order: { id: "o1" } } });
    expect(await c.confirm(() => ({ n: ++n }))).toEqual({ success: true, order: { id: "o1" } });
    expect(confirm.mock.calls.map((x) => x[0])).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("sin predicado, confirm solo reintenta confirm_in_progress", async () => {
    const { c, confirm } = setup();
    confirm.mockResolvedValue({ success: false, status: 503 });
    expect(await c.confirm(() => ({ n: 1 }))).toEqual({ success: false });
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("confirm sin la opción `confirm` falla claro (apps que solo cobran)", () => {
    const { c } = setup({ confirm: undefined });
    expect(() => c.confirm(() => ({ n: 1 }))).toThrow(/confirm/);
  });
});

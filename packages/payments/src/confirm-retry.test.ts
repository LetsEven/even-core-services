// Caracterización de pollConfirm y chargeSavedCard. Desde el cambio intencional
// de la Fase 4b, el predicado de reintento por defecto del core es el que usaba
// Tap Order & Pay (isConfirmRetryable) y lo comparten Pick & Go, Room Service y
// Tap Order & Pay; antes PG/RS solo reintentaban `confirm_in_progress`.
// Ver audit R2 y R6.
import { describe, expect, it, vi } from "vitest";
import { chargeSavedCard, type ChargeSavedCardParams } from "./charge";
import { createPaymentIntentStore, type FingerprintInput } from "./idempotency";
import { isConfirmInProgress, isConfirmRetryable, pollConfirm, waitForChargedIntent, type ConfirmResponse } from "./polling";
import { fakeClock, memoryStorage } from "./test/helpers";

interface ConfirmResult {
  success: boolean;
  data?: { order?: unknown };
  code?: string;
  status?: number;
}

const CASES: Array<{ name: string; result: ConfirmResult; retry: boolean; strict: boolean }> = [
  { name: "409 confirm_in_progress", result: { success: false, code: "confirm_in_progress", status: 409 }, retry: true, strict: true },
  { name: "409 confirm_conflict", result: { success: false, code: "confirm_conflict", status: 409 }, retry: true, strict: false },
  { name: "red caída (sin status)", result: { success: false }, retry: true, strict: false },
  { name: "429", result: { success: false, status: 429 }, retry: true, strict: false },
  { name: "500", result: { success: false, status: 500 }, retry: true, strict: false },
  { name: "503", result: { success: false, status: 503 }, retry: true, strict: false },
  { name: "402 payment_required", result: { success: false, code: "payment_required", status: 402 }, retry: false, strict: false },
  { name: "404 order_not_found", result: { success: false, code: "order_not_found", status: 404 }, retry: false, strict: false },
  { name: "409 payment_amount_mismatch", result: { success: false, code: "payment_amount_mismatch", status: 409 }, retry: false, strict: false },
  { name: "400", result: { success: false, status: 400 }, retry: false, strict: false },
];

describe("pollConfirm: predicado de reintento por defecto (todas las apps)", () => {
  it.each(CASES)("$name: reintenta = $retry", async ({ result, retry }) => {
    const confirm = vi
      .fn<() => Promise<ConfirmResult>>()
      .mockResolvedValueOnce(result)
      .mockResolvedValue({ success: true, data: { order: { id: "o1" } } });

    const outcome = await pollConfirm(confirm, fakeClock());

    expect(confirm).toHaveBeenCalledTimes(retry ? 2 : 1);
    expect(outcome.success).toBe(retry);
  });

  it("el éxito exige data.order: un success sin orden ni status se trata como fallo transitorio (igual que TOP)", async () => {
    const confirm = vi.fn().mockResolvedValue({ success: true, data: {} });
    expect(await pollConfirm(confirm, fakeClock())).toEqual({ success: false });
    expect(confirm).toHaveBeenCalledTimes(20);
  });

  it("el intervalo por defecto es 3 s y el timeout 60 s", async () => {
    const clock = fakeClock();
    const confirm = vi.fn().mockResolvedValue({ success: false, code: "confirm_in_progress" });
    await pollConfirm(confirm, clock);
    // t = 0, 3000, ..., 57000
    expect(confirm).toHaveBeenCalledTimes(20);
  });
});

describe("isConfirmRetryable", () => {
  it.each(CASES)("$name: reintenta = $retry", ({ result, retry }) => {
    expect(isConfirmRetryable(result)).toBe(retry);
  });

  it("499 no es transitorio", () => {
    expect(isConfirmRetryable({ status: 499 })).toBe(false);
  });
});

describe("waitForChargedIntent: intervalo y timeout por defecto de las apps (3 s / 60 s)", () => {
  it("consulta 20 veces y se rinde", async () => {
    const getStatus = vi.fn().mockResolvedValue({ success: true, status: "charging" });
    expect(await waitForChargedIntent(getStatus, "k", fakeClock())).toBeNull();
    expect(getStatus).toHaveBeenCalledTimes(20);
  });

  it("un fallo de red del status no corta el polling", async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValue({ success: true, status: "charged", ecartpay_order_id: "ep" });
    expect(await waitForChargedIntent(getStatus, "k", fakeClock())).toBe("ep");
  });
});

const cart: FingerprintInput = { items: [{ menuItemId: "m1", quantity: 1 }], tipAmount: 0, total: 100 };
const request: ChargeSavedCardParams["request"] = {
  paymentMethodId: "pm_1",
  amount: 100,
  currency: "MXN",
  description: "t",
  orderId: "o",
  restaurantId: "1",
};

function setup(processResult: unknown, statusResult?: unknown) {
  const storage = memoryStorage();
  const store = createPaymentIntentStore({ storage: () => storage });
  const processPayment = vi.fn().mockResolvedValue(processResult);
  const getPaymentIntentStatus = vi
    .fn()
    .mockResolvedValue(statusResult ?? { success: true, status: "charging" });
  const service = { processPayment, getPaymentIntentStatus } as unknown as ChargeSavedCardParams["service"];
  const run = () =>
    chargeSavedCard({ service, store, fingerprintInput: cart, request, poll: { ...fakeClock() } });
  return { store, processPayment, getPaymentIntentStatus, run };
}

describe("reglas de idempotencia (audit R6) de chargeSavedCard", () => {
  it("store.clear solo en intent_mismatch y payment_rejected; el resto conserva el intento", async () => {
    const outcomes: Record<string, boolean> = {};
    for (const code of [
      "intent_mismatch",
      "payment_rejected",
      "idempotency_unavailable",
      "payment_unknown",
      "charge_unconfirmed",
      "card_declined",
      "validation_error",
      "payment_in_progress",
    ]) {
      const { run, store } = setup({ success: false, code, error: { code } });
      await run();
      outcomes[code] = store.get() === null;
    }
    expect(outcomes).toEqual({
      intent_mismatch: true,
      payment_rejected: true,
      idempotency_unavailable: false,
      payment_unknown: false,
      charge_unconfirmed: false,
      card_declined: false,
      validation_error: false,
      payment_in_progress: false,
    });
  });

  it("un 2xx guarda el ecartpayOrderId; reintentar no llama /payments", async () => {
    const { run, store, processPayment } = setup({ success: true, payment: { id: "ep_1" } });
    await run();
    expect(store.get()?.ecartpayOrderId).toBe("ep_1");
    await run();
    expect(processPayment).toHaveBeenCalledOnce();
  });

  it("payment_in_progress solo consulta el status: nunca re-llama /payments", async () => {
    const { run, processPayment, getPaymentIntentStatus } = setup(
      { success: false, code: "payment_in_progress" },
      { success: true, status: "charged", ecartpay_order_id: "ep_7" },
    );
    expect(await run()).toMatchObject({ status: "charged", ecartpayOrderId: "ep_7" });
    expect(processPayment).toHaveBeenCalledOnce();
    expect(getPaymentIntentStatus).toHaveBeenCalledOnce();
  });

  it("unconfirmed nunca es retryable (la UI no ofrece recobrar)", async () => {
    for (const code of ["payment_unknown", "charge_unconfirmed"]) {
      const outcome = await setup({ success: false, code }).run();
      expect(outcome.status).toBe("unconfirmed");
    }
    expect((await setup({ success: false, code: "payment_in_progress" }).run()).status).toBe("unconfirmed");
  });

  it("solo lee payment.id: un 2xx con data.orderId (fallback inline de Room Service) cuenta como sin id", async () => {
    const { run } = setup({ success: true, data: { orderId: "ep_via_data" } });
    expect(await run()).toEqual({ status: "retryable", reason: "missing_order_id" });
  });

  it("el mensaje de payment_rejected/declined solo se toma de error.message cuando error es objeto", async () => {
    expect(await setup({ success: false, code: "payment_rejected", error: "texto plano" }).run()).toEqual({
      status: "retryable",
      reason: "payment_rejected",
      message: undefined,
    });
    expect(await setup({ success: false, error: { message: "Fondos insuficientes" } }).run()).toEqual({
      status: "retryable",
      reason: "declined",
      message: "Fondos insuficientes",
    });
  });
});

describe("pollConfirm con un predicado inyectado", () => {
  it("el predicado de la app reemplaza al de por defecto", async () => {
    const confirm = vi
      .fn<() => Promise<ConfirmResponse<unknown>>>()
      .mockResolvedValue({ success: false, status: 503 });
    const outcome = await pollConfirm(confirm, { ...fakeClock(), isConfirmRetryable: () => false });
    expect(outcome.success).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("isConfirmInProgress (estricto) solo reintenta confirm_in_progress", () => {
    for (const c of CASES) expect(isConfirmInProgress(c.result)).toBe(c.strict);
  });
});

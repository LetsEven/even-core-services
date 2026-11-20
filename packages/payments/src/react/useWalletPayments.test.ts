// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWalletPayments, type UseWalletPaymentsOptions } from "./useWalletPayments";

type Handler = (event?: unknown) => unknown;
function fakeSdk() {
  const handlers: Record<string, Handler> = {};
  return {
    handlers,
    on: vi.fn((e: string, h: Handler) => void (handlers[e] = h)),
    render: vi.fn(),
  };
}

const plan = (n = 1) => ({
  fingerprint: { items: [{ menuItemId: "m1", quantity: 1 }], tipAmount: 0, total: 100 + n },
  request: { amount: 100 + n, currency: "MXN", restaurantId: "4", baseAmount: 100, tipAmount: 0 },
});

function setup(over: Partial<UseWalletPaymentsOptions> = {}) {
  const paymentService = {
    createApplePayOrder: vi.fn().mockResolvedValue({ success: true, orderId: "ap_1" }),
    createGooglePayOrder: vi.fn().mockResolvedValue({ success: true, data: { orderId: "gp_1" } }),
    getEcartOrderStatus: vi.fn().mockResolvedValue(null),
  };
  const opts: UseWalletPaymentsOptions = {
    paymentService,
    canCreateOrders: true,
    orderKey: "k1",
    amount: 101,
    prepareOrder: () => plan(),
    isSecureDocument: () => true,
    onApplePaySuccess: vi.fn(),
    onGooglePaySuccess: vi.fn(),
    onGooglePayPaymentError: vi.fn(),
    ...over,
  };
  return { paymentService, opts };
}

const w = window as unknown as { ApplePaySession?: unknown; Pay?: unknown };
let apple: ReturnType<typeof fakeSdk>;
let google: ReturnType<typeof fakeSdk>;

beforeEach(() => {
  sessionStorage.clear();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  apple = fakeSdk();
  google = fakeSdk();
  w.ApplePaySession = { canMakePayments: () => true };
  w.Pay = { ApplePay: apple, GooglePay: google };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete w.ApplePaySession;
  delete w.Pay;
});

describe("useWalletPayments: órdenes", () => {
  it("pide las órdenes al montar, con el cuerpo de la app, las cachea y renderiza los botones", async () => {
    const { opts, paymentService } = setup({ apple: { label: "Even" } });
    renderHook(() => useWalletPayments(opts));
    await waitFor(() => expect(apple.render).toHaveBeenCalled());
    await waitFor(() => expect(google.render).toHaveBeenCalled());
    expect(paymentService.createApplePayOrder).toHaveBeenCalledOnce();
    expect(paymentService.createApplePayOrder).toHaveBeenCalledWith(plan().request);
    expect(paymentService.createGooglePayOrder).toHaveBeenCalledWith(plan().request);
    expect(apple.render).toHaveBeenCalledWith(
      expect.objectContaining({ container: "#apple-pay-container", orderId: "ap_1", amount: 101, label: "Even", supportedNetworks: ["visa", "masterCard"] }),
    );
    expect(google.render).toHaveBeenCalledWith(expect.objectContaining({ container: "#google-pay-container", orderId: "gp_1" }));
    expect(JSON.parse(sessionStorage.getItem("even-applepay-order")!).orderId).toBe("ap_1");
    expect(JSON.parse(sessionStorage.getItem("even-googlepay-order")!).orderId).toBe("gp_1");
    expect(opts.apple?.label).toBe("Even");
  });

  it("sin label no lo manda (FlexBill)", async () => {
    const { opts } = setup();
    renderHook(() => useWalletPayments(opts));
    await waitFor(() => expect(apple.render).toHaveBeenCalled());
    expect(apple.render.mock.calls[0][0]).not.toHaveProperty("label");
  });

  it("no pide órdenes mientras canCreateOrders sea false, y las pide al cambiar a true (una sola vez)", async () => {
    const { opts, paymentService } = setup({ canCreateOrders: false });
    const { rerender } = renderHook((o: UseWalletPaymentsOptions) => useWalletPayments(o), { initialProps: opts });
    await act(async () => {});
    expect(paymentService.createApplePayOrder).not.toHaveBeenCalled();
    rerender({ ...opts, canCreateOrders: true, orderKey: "k2" });
    await waitFor(() => expect(apple.render).toHaveBeenCalled());
    rerender({ ...opts, canCreateOrders: true, orderKey: "k3" });
    await act(async () => {});
    expect(paymentService.createApplePayOrder).toHaveBeenCalledOnce();
  });

  it("reutiliza la orden cacheada si el fingerprint no cambió", async () => {
    const first = setup();
    const a = renderHook(() => useWalletPayments(first.opts));
    await waitFor(() => expect(apple.render).toHaveBeenCalled());
    a.unmount();
    const second = setup();
    renderHook(() => useWalletPayments(second.opts));
    await waitFor(() => expect(apple.render).toHaveBeenCalledTimes(2));
    expect(second.paymentService.createApplePayOrder).not.toHaveBeenCalled();
  });

  it("guard HTTPS: en un documento inseguro Apple Pay se oculta y no pide orden; Google sigue", async () => {
    const { opts, paymentService } = setup({ isSecureDocument: () => false });
    const { result } = renderHook(() => useWalletPayments(opts));
    await waitFor(() => expect(google.render).toHaveBeenCalled());
    expect(result.current.applePayUnavailable).toBe(true);
    expect(paymentService.createApplePayOrder).not.toHaveBeenCalled();
    expect(paymentService.createGooglePayOrder).toHaveBeenCalled();
  });

  it("un 4xx con código oculta ambas wallets; un 503 no las oculta y reintenta al cambiar orderKey", async () => {
    const rejected = setup();
    rejected.paymentService.createApplePayOrder.mockResolvedValue({ success: false, status: 422, code: "payment_rejected" });
    const r = renderHook(() => useWalletPayments(rejected.opts));
    await waitFor(() => expect(r.result.current.walletOrderRejected).toBe(true));
    expect(r.result.current.applePayUnavailable).toBe(true);

    const flaky = setup();
    flaky.paymentService.createApplePayOrder
      .mockResolvedValueOnce({ success: false, status: 503 })
      .mockResolvedValue({ success: true, orderId: "ap_2" });
    const f = renderHook((o: UseWalletPaymentsOptions) => useWalletPayments(o), { initialProps: flaky.opts });
    await waitFor(() => expect(flaky.paymentService.createApplePayOrder).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(f.result.current.walletOrderRejected).toBe(false);
    expect(f.result.current.applePayUnavailable).toBe(false);
    f.rerender({ ...flaky.opts, orderKey: "k2" });
    await waitFor(() => expect(apple.render).toHaveBeenCalledWith(expect.objectContaining({ orderId: "ap_2" })));
  });

  it("onOrderCreated recibe el id justo después de crear la orden", async () => {
    const onOrderCreated = vi.fn();
    const { opts } = setup({ onOrderCreated });
    renderHook(() => useWalletPayments(opts));
    await waitFor(() => expect(onOrderCreated).toHaveBeenCalledWith("google", "gp_1"));
    expect(onOrderCreated).toHaveBeenCalledWith("apple", "ap_1");
  });

  it("google.createOrderWhenUnavailable pide la orden de Google aunque esté no disponible (PG/FB); por defecto no", async () => {
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)");
    const def = setup();
    renderHook(() => useWalletPayments(def.opts));
    await waitFor(() => expect(def.paymentService.createApplePayOrder).toHaveBeenCalled());
    await act(async () => {});
    expect(def.paymentService.createGooglePayOrder).not.toHaveBeenCalled();
    sessionStorage.clear();
    const pg = setup({ google: { createOrderWhenUnavailable: true } });
    renderHook(() => useWalletPayments(pg.opts));
    await waitFor(() => expect(pg.paymentService.createGooglePayOrder).toHaveBeenCalled());
    ua.mockRestore();
  });

  it("apple.disabled / google.disabled no piden orden", async () => {
    const { opts, paymentService } = setup({ apple: { disabled: true }, google: { disabled: true } });
    const { result } = renderHook(() => useWalletPayments(opts));
    await act(async () => {});
    expect(paymentService.createApplePayOrder).not.toHaveBeenCalled();
    expect(paymentService.createGooglePayOrder).not.toHaveBeenCalled();
    expect(result.current.applePayUnavailable).toBe(true);
    expect(result.current.googlePayUnavailable).toBe(true);
  });
});

describe("useWalletPayments: eventos del SDK", () => {
  it("success de Apple Pay: limpia la caché, marca procesando y avisa a la app", async () => {
    const { opts } = setup();
    const { result } = renderHook(() => useWalletPayments(opts));
    await waitFor(() => expect(apple.render).toHaveBeenCalled());
    act(() => void apple.handlers.success({ detail: { id: "pay_9" } }));
    expect(sessionStorage.getItem("even-applepay-order")).toBeNull();
    expect(result.current.isApplePayProcessing).toBe(true);
    expect(result.current.applePayPaymentId).toBe("pay_9");
    expect(opts.onApplePaySuccess).toHaveBeenCalledWith(expect.objectContaining({ orderId: "ap_1", paymentId: "pay_9" }));
    act(() => void apple.handlers.success({}));
    expect(result.current.applePayPaymentId).toBe("ap_1");
  });

  it("error de Apple Pay: antes de ready oculta; después de ready solo deja reintentar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { opts } = setup();
    const { result } = renderHook(() => useWalletPayments(opts));
    await vi.waitFor(() => expect(apple.render).toHaveBeenCalled());
    act(() => void apple.handlers.ready());
    await act(async () => void vi.advanceTimersByTime(2900));
    expect(result.current.applePayReady).toBe(true);
    act(() => void apple.handlers.error({}));
    expect(result.current.applePayUnavailable).toBe(false);
    expect(result.current.isApplePayProcessing).toBe(false);
  });

  it("error de Google Pay antes de ready oculta; con el botón listo avisa a la app", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { opts } = setup();
    const { result } = renderHook(() => useWalletPayments(opts));
    await vi.waitFor(() => expect(google.render).toHaveBeenCalled());
    act(() => void google.handlers.error({}));
    expect(result.current.googlePayUnavailable).toBe(true);
    expect(opts.onGooglePayPaymentError).not.toHaveBeenCalled();
  });

  it("error de Google Pay con el botón listo no lo oculta y llama a onGooglePayPaymentError", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { opts } = setup();
    const { result } = renderHook(() => useWalletPayments(opts));
    await vi.waitFor(() => expect(google.render).toHaveBeenCalled());
    act(() => void google.handlers.ready());
    await act(async () => void vi.advanceTimersByTime(2900));
    act(() => void google.handlers.error("boom"));
    expect(result.current.googlePayUnavailable).toBe(false);
    expect(opts.onGooglePayPaymentError).toHaveBeenCalledWith("boom");
  });

  it("success de Google Pay: id según la opción, token, y solo una vez", async () => {
    const byOrder = setup();
    const a = renderHook(() => useWalletPayments(byOrder.opts));
    await waitFor(() => expect(google.render).toHaveBeenCalled());
    act(() => void google.handlers.success({ detail: { token: "tok", activity_id: "act" } }));
    act(() => void google.handlers.success({ detail: { token: "tok2" } }));
    expect(byOrder.opts.onGooglePaySuccess).toHaveBeenCalledTimes(1);
    expect(byOrder.opts.onGooglePaySuccess).toHaveBeenCalledWith({ orderId: "gp_1", paymentId: "gp_1", token: "tok" });
    expect(a.result.current.isGooglePayProcessing).toBe(true);
    a.unmount();

    sessionStorage.clear();
    google = fakeSdk();
    (w.Pay as { GooglePay: unknown }).GooglePay = google;
    const byActivity = setup({ google: { paymentId: "activity_id" } });
    renderHook(() => useWalletPayments(byActivity.opts));
    await waitFor(() => expect(google.render).toHaveBeenCalled());
    act(() => void google.handlers.success({ detail: { activity_id: "act" } }));
    expect(byActivity.opts.onGooglePaySuccess).toHaveBeenCalledWith({ orderId: "gp_1", paymentId: "act", token: null });
  });

  it("3DS: el overlay se revisa por polling y, si ya está pagada, confirma sin token", async () => {
    const { opts, paymentService } = setup();
    paymentService.getEcartOrderStatus.mockResolvedValue("paid");
    renderHook(() => useWalletPayments(opts));
    await waitFor(() => expect(google.render).toHaveBeenCalled());
    const overlay = document.createElement("div");
    overlay.id = "ecartpay-3ds-overlay";
    document.body.appendChild(overlay);
    await waitFor(() => expect(opts.onGooglePaySuccess).toHaveBeenCalledWith({ orderId: "gp_1", paymentId: "gp_1", token: null }));
    expect(document.getElementById("ecartpay-3ds-overlay")).toBeNull();
    expect(paymentService.getEcartOrderStatus).toHaveBeenCalledWith("gp_1");
  });

  it("3DS: si la orden aún no está pagada el overlay queda visible", async () => {
    const { opts, paymentService } = setup();
    paymentService.getEcartOrderStatus.mockResolvedValue("pending");
    renderHook(() => useWalletPayments(opts));
    await waitFor(() => expect(google.render).toHaveBeenCalled());
    const overlay = document.createElement("div");
    overlay.id = "ecartpay-3ds-overlay";
    document.body.appendChild(overlay);
    await waitFor(() => expect(paymentService.getEcartOrderStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(overlay.style.visibility).toBe("");
    expect(opts.onGooglePaySuccess).not.toHaveBeenCalled();
  });
});

describe("useWalletPayments: soporte y carga del SDK", () => {
  const scripts = () => document.head.querySelectorAll('script[src="https://pay.ecart.com/sdk/pay.js"]').length;

  it("con ApplePaySession carga el script una sola vez", async () => {
    const { opts } = setup();
    renderHook(() => useWalletPayments(opts));
    await waitFor(() => expect(apple.render).toHaveBeenCalled());
    expect(scripts()).toBe(1);
  });

  it("retry: detecta un ApplePaySession inyectado tarde", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    delete w.ApplePaySession;
    const { opts } = setup({ canCreateOrders: false, google: { disabled: true } });
    const { result } = renderHook(() => useWalletPayments(opts));
    await act(async () => void vi.advanceTimersByTime(600));
    expect(scripts()).toBe(0);
    w.ApplePaySession = { canMakePayments: () => true };
    await act(async () => void vi.advanceTimersByTime(400));
    expect(scripts()).toBe(1);
    expect(result.current.applePayUnavailable).toBe(false);
  });

  it("retry: sin ApplePaySession tras ~3 s se oculta", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    delete w.ApplePaySession;
    const { opts } = setup({ canCreateOrders: false });
    const { result } = renderHook(() => useWalletPayments(opts));
    await act(async () => void vi.advanceTimersByTime(3100));
    expect(result.current.applePayUnavailable).toBe(true);
  });

  it("once: sin ApplePaySession se oculta (TP) o se ignora (TOP)", async () => {
    delete w.ApplePaySession;
    const tp = renderHook(() => useWalletPayments(setup({ canCreateOrders: false, apple: { detection: "once" } }).opts));
    expect(tp.result.current.applePayUnavailable).toBe(true);
    const top = renderHook(() =>
      useWalletPayments(setup({ canCreateOrders: false, apple: { detection: "once", onUnsupported: "ignore" } }).opts),
    );
    expect(top.result.current.applePayUnavailable).toBe(false);
  });

  it("sdkEnabled=false no carga el script", async () => {
    const { opts } = setup({ canCreateOrders: false, sdkEnabled: false });
    renderHook(() => useWalletPayments(opts));
    await act(async () => {});
    expect(scripts()).toBe(0);
  });

  it("Google Pay arranca oculto en iOS y no carga el SDK", () => {
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)");
    const { opts } = setup({ canCreateOrders: false });
    const { result } = renderHook(() => useWalletPayments(opts));
    expect(result.current.googlePayUnavailable).toBe(true);
    ua.mockRestore();
  });
});

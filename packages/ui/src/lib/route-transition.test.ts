import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flowStepOf, startRouteTransition } from "./route-transition";

const STEPS = ["cart", "order-confirm", "card-selection"];

describe("flowStepOf", () => {
  it("encuentra el paso con y sin sucursal en la ruta", () => {
    expect(flowStepOf("/29/cart?branch=1", STEPS)).toBe("cart");
    expect(flowStepOf("/29/7/order-confirm?table=3", STEPS)).toBe("order-confirm");
  });

  it("devuelve null fuera del flujo", () => {
    expect(flowStepOf("/29/7/menu", STEPS)).toBeNull();
  });
});

describe("startRouteTransition", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("navega sin animación cuando la ruta actual no es un paso del flujo", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    window.history.pushState({}, "", "/29/7/menu");
    const navigate = vi.fn();
    startRouteTransition("/29/7/cart", navigate, STEPS);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("navega sin animación con movimiento reducido", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    window.history.pushState({}, "", "/29/7/cart");
    const navigate = vi.fn();
    startRouteTransition("/29/7/order-confirm", navigate, STEPS);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe("transición con compuerta de datos", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mantiene el esqueleto hasta que la vista declara que está lista", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    window.history.pushState({}, "", "/29/cart");
    const navigate = vi.fn();
    const { renderHook, act } = await import("@testing-library/react");
    const { usePendingFlowStep, notifyRouteChanged, useFlowStepReady } = await import("./route-transition");

    const pending = renderHook(() => usePendingFlowStep());
    const page = renderHook(({ ready }) => useFlowStepReady(ready), { initialProps: { ready: false } });

    act(() => startRouteTransition("/29/order-confirm", navigate, STEPS, { leaveMs: 10, enterMs: 20 }));
    act(() => vi.advanceTimersByTime(10));
    expect(pending.result.current).toBe("order-confirm");

    act(() => notifyRouteChanged());
    act(() => vi.advanceTimersByTime(500));
    expect(pending.result.current).toBe("order-confirm"); // la vista aún no tiene datos

    page.rerender({ ready: true });
    act(() => vi.advanceTimersByTime(20));
    expect(pending.result.current).toBeNull();
  });
});

describe("volver en el flujo", () => {
  const BACK_STEPS = ["cart", "order-confirm", "card-selection"];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { resetFlowHistory } = await import("./route-transition");
    resetFlowHistory();
    window.history.replaceState({}, "", "/29/cart");
  });

  afterEach(async () => {
    const { act } = await import("@testing-library/react");
    // Deja el motor sin esqueleto pendiente para el siguiente test.
    act(() => vi.advanceTimersByTime(10_000));
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Simula la vista montada: lo que hace `RouteTransitionGate` en cada cambio de ruta. */
  async function mount(path: string, kind?: "push" | "replace") {
    const { markNavigation, recordFlowPath } = await import("./route-transition");
    if (kind) markNavigation(kind);
    window.history.pushState({}, "", path);
    recordFlowPath(path);
  }

  it("registra la vista anterior de cada ruta montada", async () => {
    const { recordFlowPath, getPreviousFlowPath } = await import("./route-transition");
    recordFlowPath("/29/cart");
    expect(getPreviousFlowPath()).toBeNull();
    await mount("/29/order-confirm", "push");
    expect(getPreviousFlowPath()).toBe("/29/cart");
    await mount("/29/card-selection", "replace");
    // replace sustituye la vista actual: la anterior sigue siendo el carrito
    expect(getPreviousFlowPath()).toBe("/29/cart");
  });

  it("conserva la pila entre recargas (sessionStorage)", async () => {
    const { recordFlowPath } = await import("./route-transition");
    recordFlowPath("/29/cart");
    await mount("/29/order-confirm", "push");
    expect(JSON.parse(window.sessionStorage.getItem("even:flow-history") ?? "[]")).toEqual([
      "/29/cart",
      "/29/order-confirm",
    ]);
    vi.resetModules();
    const fresh = await import("./route-transition");
    expect(fresh.getPreviousFlowPath()).toBe("/29/cart");
  });

  it("back: la tarjeta baja, aparece el esqueleto de la anterior y navega hacia atrás", async () => {
    const { recordFlowPath, startRouteBack, usePendingFlowStep } = await import("./route-transition");
    const { renderHook, act } = await import("@testing-library/react");
    recordFlowPath("/29/cart");
    await mount("/29/order-confirm", "push");
    const pending = renderHook(() => usePendingFlowStep());
    const navigateBack = vi.fn();

    act(() => startRouteBack(navigateBack, BACK_STEPS, { leaveMs: 10, enterMs: 20 }));
    expect(navigateBack).not.toHaveBeenCalled(); // primero baja la tarjeta
    expect(pending.result.current).toBeNull();

    act(() => vi.advanceTimersByTime(10));
    expect(pending.result.current).toBe("cart");
    expect(navigateBack).toHaveBeenCalledTimes(1);
  });

  it("back: sin vista anterior conocida navega sin animación", async () => {
    const { recordFlowPath, startRouteBack, usePendingFlowStep } = await import("./route-transition");
    const { renderHook, act } = await import("@testing-library/react");
    recordFlowPath("/29/cart");
    const pending = renderHook(() => usePendingFlowStep());
    const navigateBack = vi.fn();
    act(() => startRouteBack(navigateBack, BACK_STEPS, { leaveMs: 10 }));
    expect(navigateBack).toHaveBeenCalledTimes(1);
    expect(pending.result.current).toBeNull();
  });

  it("back: con movimiento reducido navega sin animación", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { recordFlowPath, startRouteBack, usePendingFlowStep } = await import("./route-transition");
    const { renderHook, act } = await import("@testing-library/react");
    recordFlowPath("/29/cart");
    await mount("/29/order-confirm", "push");
    const pending = renderHook(() => usePendingFlowStep());
    const navigateBack = vi.fn();
    act(() => startRouteBack(navigateBack, BACK_STEPS));
    expect(navigateBack).toHaveBeenCalledTimes(1);
    expect(pending.result.current).toBeNull();
  });

  it("back: la anterior fuera del flujo (menú) navega sin animación", async () => {
    const { recordFlowPath, startRouteBack } = await import("./route-transition");
    const { act } = await import("@testing-library/react");
    recordFlowPath("/29/menu");
    await mount("/29/cart", "push");
    const navigateBack = vi.fn();
    act(() => startRouteBack(navigateBack, BACK_STEPS));
    expect(navigateBack).toHaveBeenCalledTimes(1);
  });

  it("popstate externo entre pasos: solo entrada, el esqueleto aparece de inmediato", async () => {
    const { recordFlowPath, startPopstateListener, usePendingFlowStep } = await import("./route-transition");
    const { renderHook, act } = await import("@testing-library/react");
    recordFlowPath("/29/cart");
    await mount("/29/order-confirm", "push");
    const pending = renderHook(() => usePendingFlowStep());
    const stop = startPopstateListener(BACK_STEPS, { enterMs: 20 });

    // El navegador ya cambió la URL cuando dispara popstate.
    window.history.replaceState({}, "", "/29/cart");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(pending.result.current).toBe("cart");
    expect(document.querySelector("[data-flow-leaving]")).toBeNull(); // sin fase de bajada
    stop();
  });

  it("popstate externo respeta el maxWaitMs si la ruta nunca monta", async () => {
    const { recordFlowPath, startPopstateListener, usePendingFlowStep } = await import("./route-transition");
    const { renderHook, act } = await import("@testing-library/react");
    recordFlowPath("/29/cart");
    await mount("/29/order-confirm", "push");
    const pending = renderHook(() => usePendingFlowStep());
    const stop = startPopstateListener(BACK_STEPS, { maxWaitMs: 300 });
    window.history.replaceState({}, "", "/29/cart");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(pending.result.current).toBe("cart");
    act(() => vi.advanceTimersByTime(300));
    expect(pending.result.current).toBeNull();
    stop();
  });

  it("popstate externo con movimiento reducido o dentro de la misma vista no anima", async () => {
    const { recordFlowPath, startPopstateListener, usePendingFlowStep } = await import("./route-transition");
    const { renderHook, act } = await import("@testing-library/react");
    recordFlowPath("/29/cart");
    await mount("/29/order-confirm", "push");
    const pending = renderHook(() => usePendingFlowStep());
    const stop = startPopstateListener(BACK_STEPS);

    // Mismo paso (p. ej. se cierra un modal que había agregado una entrada al historial)
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(pending.result.current).toBeNull();

    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    window.history.replaceState({}, "", "/29/cart");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(pending.result.current).toBeNull();
    stop();
  });

  it("el popstate de nuestro propio back no duplica la animación", async () => {
    const { recordFlowPath, startRouteBack, startPopstateListener, usePendingFlowStep } = await import(
      "./route-transition"
    );
    const { renderHook, act } = await import("@testing-library/react");
    recordFlowPath("/29/cart");
    await mount("/29/order-confirm", "push");
    const pending = renderHook(() => usePendingFlowStep());
    const stop = startPopstateListener(BACK_STEPS, { enterMs: 20 });

    act(() => startRouteBack(() => {
      window.history.replaceState({}, "", "/29/cart");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, BACK_STEPS, { leaveMs: 10, enterMs: 20 }));
    act(() => vi.advanceTimersByTime(10));
    expect(pending.result.current).toBe("cart");

    // La ruta se monta y el esqueleto se retira: el popstate propio no lo reinició.
    const { notifyRouteChanged, recordFlowPath: record } = await import("./route-transition");
    act(() => {
      record("/29/cart");
      notifyRouteChanged();
    });
    act(() => vi.advanceTimersByTime(20));
    expect(pending.result.current).toBeNull();
    stop();
  });

  it("al volver, la pila recorta hasta la vista de destino", async () => {
    const { recordFlowPath, getPreviousFlowPath } = await import("./route-transition");
    recordFlowPath("/29/cart");
    await mount("/29/order-confirm", "push");
    await mount("/29/card-selection", "push");
    const { startPopstateListener } = await import("./route-transition");
    const stop = startPopstateListener(BACK_STEPS);
    window.history.replaceState({}, "", "/29/cart");
    window.dispatchEvent(new PopStateEvent("popstate"));
    recordFlowPath("/29/cart");
    expect(getPreviousFlowPath()).toBeNull();
    stop();
  });
});

describe("tiempos", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("un campo undefined en las opciones no pisa el valor por defecto", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    window.history.replaceState({}, "", "/29/cart");
    const { renderHook, act } = await import("@testing-library/react");
    const { startRouteTransition: start, usePendingFlowStep, DEFAULT_FLOW_TIMING } = await import("./route-transition");
    const pending = renderHook(() => usePendingFlowStep());
    const navigate = vi.fn();
    act(() => start("/29/order-confirm", navigate, STEPS, { leaveMs: undefined, enterMs: undefined, maxWaitMs: undefined }));
    act(() => vi.advanceTimersByTime(DEFAULT_FLOW_TIMING.leaveMs - 1));
    expect(navigate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(pending.result.current).toBe("order-confirm");
    act(() => vi.advanceTimersByTime(DEFAULT_FLOW_TIMING.maxWaitMs));
    expect(pending.result.current).toBeNull();
  });
});

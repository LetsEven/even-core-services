import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordFlowPath, resetFlowHistory } from "../lib/route-transition";
import { FlowStepCard, FlowTransitionProvider, useFlowNavigation } from "./FlowTransition";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
let search = "";
let pathname = "/29/cart";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

const STEPS = ["cart", "order-confirm"];
const screens = {
  cart: { hero: <p>Título del carrito</p>, body: <p>Esqueleto del carrito</p> },
  "order-confirm": ({ params }: { params: URLSearchParams }) => ({
    hero: <p>Título de confirmar</p>,
    body: <p>{`Esqueleto de confirmar ${params.get("type") ?? "normal"}`}</p>,
    layout: "anchored" as const,
  }),
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <FlowTransitionProvider steps={STEPS} screens={screens} header={<span>cabecera</span>} timing={{ leaveMs: 10, enterMs: 20 }}>
    {children}
  </FlowTransitionProvider>
);

describe("FlowTransitionProvider + useFlowNavigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    window.history.replaceState({}, "", "/29/cart");
    pathname = "/29/cart";
    search = "";
    resetFlowHistory();
    Object.values(router).forEach((fn) => fn.mockReset());
  });

  afterEach(() => {
    act(() => vi.advanceTimersByTime(10_000));
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("push entre pasos: baja la tarjeta, muestra el esqueleto destino y navega", () => {
    const { result } = renderHook(() => useFlowNavigation(), { wrapper });
    act(() => result.current.push("/29/order-confirm?type=x"));
    expect(router.push).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(10));
    expect(router.push).toHaveBeenCalledWith("/29/order-confirm?type=x");
    expect(document.querySelector('[data-flow-overlay="order-confirm"]')).not.toBeNull();
    // La pantalla del paso puede depender de la query del destino.
    expect(screen.getByText("Esqueleto de confirmar x")).toBeTruthy();
  });

  it("push hacia una vista que no es del flujo navega sin animación", () => {
    const { result } = renderHook(() => useFlowNavigation(), { wrapper });
    act(() => result.current.push("/29/menu"));
    expect(router.push).toHaveBeenCalledWith("/29/menu");
    expect(document.querySelector("[data-flow-overlay]")).toBeNull();
  });

  it("replace navega con router.replace", () => {
    const { result } = renderHook(() => useFlowNavigation(), { wrapper });
    act(() => result.current.replace("/29/order-confirm"));
    act(() => vi.advanceTimersByTime(10));
    expect(router.replace).toHaveBeenCalledWith("/29/order-confirm");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("back sin historial previo navega al respaldo con transición", () => {
    const { result } = renderHook(() => useFlowNavigation(), { wrapper });
    act(() => result.current.back("/29/order-confirm"));
    act(() => vi.advanceTimersByTime(10));
    expect(router.push).toHaveBeenCalledWith("/29/order-confirm");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("back con historial previo vuelve con router.back y muestra el esqueleto de la anterior", () => {
    // Historial del flujo: carrito → confirmar (lo que registra el gate al montar cada ruta)
    recordFlowPath("/29/cart");
    window.history.pushState({}, "", "/29/order-confirm");
    recordFlowPath("/29/order-confirm");
    pathname = "/29/order-confirm";
    const { result } = renderHook(() => useFlowNavigation(), { wrapper });
    act(() => result.current.back("/29/menu"));
    expect(router.back).not.toHaveBeenCalled(); // primero baja la tarjeta
    act(() => vi.advanceTimersByTime(10));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(document.querySelector('[data-flow-overlay="cart"]')).not.toBeNull();
  });
});

describe("FlowStepCard", () => {
  beforeEach(() => {
    search = "";
    pathname = "/29/order-confirm";
  });

  it("muestra el título de la pantalla y el contenido de la vista", () => {
    render(
      <FlowStepCard step="cart">
        <p>Contenido real</p>
      </FlowStepCard>,
      { wrapper },
    );
    expect(screen.getByText("Título del carrito")).toBeTruthy();
    expect(screen.getByText("Contenido real")).toBeTruthy();
  });

  it("con loading pinta el esqueleto del paso en vez del contenido", () => {
    search = "type=equal";
    render(
      <FlowStepCard step="order-confirm" loading>
        <p>Contenido real</p>
      </FlowStepCard>,
      { wrapper },
    );
    expect(screen.queryByText("Contenido real")).toBeNull();
    expect(screen.getByText("Esqueleto de confirmar equal")).toBeTruthy();
    expect(document.querySelector(".sheet-card")?.className).toContain("flex-none");
  });

  it("acepta un título propio de la vista", () => {
    render(
      <FlowStepCard step="cart" hero={<p>Otro título</p>}>
        <p>Contenido real</p>
      </FlowStepCard>,
      { wrapper },
    );
    expect(screen.getByText("Otro título")).toBeTruthy();
    expect(screen.queryByText("Título del carrito")).toBeNull();
  });
});

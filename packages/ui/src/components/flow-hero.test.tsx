import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setFlowAmount, formatMoney } from "../lib/flow-amount";
import { AmountHero, TitleHero } from "./flow-hero";

afterEach(() => act(() => setFlowAmount(null)));

describe("AmountHero", () => {
  it("sin monto publicado pinta el esqueleto con las mismas medidas", () => {
    const { container } = render(<AmountHero context="Mesa 1" title="Revisa tu cuenta" label="Total a pagar" />);
    expect(container.textContent).toContain("Mesa 1 · Revisa tu cuenta");
    expect(screen.getByText("Total a pagar")).toBeTruthy();
    expect(screen.getByTestId("flow-hero-total").textContent).toBe("$000.00");
  });

  it("lee el monto vivo que publica la vista y lo actualiza", () => {
    render(<AmountHero context="Mesa 1" title="Revisa tu cuenta" label="Total a pagar" />);
    act(() => setFlowAmount({ total: formatMoney(50.6), breakdown: "Cuenta $46.00 + propina $4.60" }));
    expect(screen.getByTestId("flow-hero-total").textContent).toBe("$50.60");
    expect(screen.getByText("Cuenta $46.00 + propina $4.60")).toBeTruthy();
    act(() => setFlowAmount({ total: "$52.90", breakdown: "Cuenta $46.00 + propina $6.90" }));
    expect(screen.getByTestId("flow-hero-total").textContent).toBe("$52.90");
  });

  it("la etiqueta publicada sustituye a la de la pantalla", () => {
    render(<AmountHero title="Opciones" label="Total a pagar" />);
    act(() => setFlowAmount({ total: "$10.00", label: "Saldo" }));
    expect(screen.getByText("Saldo")).toBeTruthy();
  });
});

describe("TitleHero", () => {
  it("contexto y título grande sin bloque de monto", () => {
    const { container } = render(<TitleHero context="Mesa 1" title="¿Cómo te llamas?" />);
    expect(screen.getByText("Mesa 1")).toBeTruthy();
    expect(screen.getByText("¿Cómo te llamas?")).toBeTruthy();
    expect(container.querySelector("[data-testid=flow-hero-total]")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("dos decimales y tolera valores no finitos", () => {
    expect(formatMoney(4.6)).toBe("$4.60");
    expect(formatMoney(Number.NaN)).toBe("$0.00");
  });
});

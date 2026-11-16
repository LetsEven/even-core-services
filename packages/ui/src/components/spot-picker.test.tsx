import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpotPicker, type SpotPickerLabels } from "./spot-picker";

const labels: SpotPickerLabels = {
  title: "Elige tu mesa",
  subtitle: "Toca una mesa",
  spotLabel: (id) => `Mesa ${id}`,
  statuses: { available: "Libre", occupied: "Ocupada", reserved: "Reservada", unknown: "—" },
  filterAll: "Todas",
  filterAvailable: "Libres",
  empty: "Sin mesas",
  error: "No se pudo cargar",
  retry: "Reintentar",
};

const items = [
  { id: "1", status: "available" as const },
  { id: "2", status: "occupied" as const },
];

const base = { loading: false, failed: false, labels, onSelect: () => {}, onRetry: () => {} };

describe("SpotPicker", () => {
  it("llama onSelect con el id de la casilla", () => {
    const onSelect = vi.fn();
    render(<SpotPicker {...base} items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Mesa 2, Ocupada" }));
    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("el filtro 'Libres' oculta las ocupadas", () => {
    render(<SpotPicker {...base} items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Libres" }));
    expect(screen.queryByRole("button", { name: /Mesa 2/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Mesa 1/ })).toBeTruthy();
  });

  it("muestra error con reintento", () => {
    const onRetry = vi.fn();
    render(<SpotPicker {...base} items={null} failed onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("muestra estado vacío", () => {
    render(<SpotPicker {...base} items={[]} />);
    expect(screen.getByText("Sin mesas")).toBeTruthy();
  });
});

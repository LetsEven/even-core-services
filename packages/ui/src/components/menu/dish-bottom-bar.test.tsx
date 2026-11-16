import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DishBottomBar } from "./dish-bottom-bar";

const labels = { decrement: "Quitar uno", increment: "Agregar uno" };

describe("DishBottomBar", () => {
  it("los botones de cantidad tienen nombre y avisan al tocarlos", async () => {
    const onMinus = vi.fn();
    const onPlus = vi.fn();
    render(<DishBottomBar labels={labels} quantity={2} onMinus={onMinus} onPlus={onPlus} label="Agregar $20.00" />);
    await userEvent.click(screen.getByRole("button", { name: "Quitar uno" }));
    await userEvent.click(screen.getByRole("button", { name: "Agregar uno" }));
    expect(onMinus).toHaveBeenCalledOnce();
    expect(onPlus).toHaveBeenCalledOnce();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("el botón principal respeta disabled y loading", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<DishBottomBar labels={labels} onSubmit={onSubmit} label="Agregar" />);
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    rerender(<DishBottomBar labels={labels} onSubmit={onSubmit} label="Agregar" disabled />);
    expect((screen.getByRole("button", { name: "Agregar" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<DishBottomBar labels={labels} onSubmit={onSubmit} loading />);
    expect((screen.getByRole("button", { name: "Quitar uno" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

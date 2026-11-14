import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SheetCard, SheetFooter, SheetHero, SheetScreen } from "./sheet-screen";

describe("SheetScreen", () => {
  it("la tarjeta ocupa todo el ancho, sin márgenes laterales", () => {
    render(
      <SheetScreen>
        <SheetHero>Título</SheetHero>
        <SheetCard data-testid="card">Contenido</SheetCard>
        <SheetFooter data-testid="footer">Acciones</SheetFooter>
      </SheetScreen>,
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("w-full");
    expect(card.className).not.toMatch(/\bmx-/);
    expect(screen.getByTestId("footer").className).toContain("inset-x-0");
  });
});

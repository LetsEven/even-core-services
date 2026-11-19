import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FlowCard } from "./flow-card";

describe("FlowCard", () => {
  it("fill: tarjeta que llena la pantalla con el título detrás", () => {
    const { container } = render(
      <FlowCard hero={<p>Título</p>}>
        <p>Contenido</p>
      </FlowCard>,
    );
    expect(screen.getByText("Título")).toBeTruthy();
    expect(container.querySelector(".sheet-card")?.className).toContain("overflow-hidden");
    expect(container.firstElementChild?.className).not.toContain("justify-end");
  });

  it("anchored: tarjeta del alto de su contenido anclada abajo", () => {
    const { container } = render(
      <FlowCard layout="anchored" hero={<p>Título</p>}>
        <p>Contenido</p>
      </FlowCard>,
    );
    expect(container.firstElementChild?.className).toContain("justify-end");
    expect(container.querySelector(".sheet-card")?.className).toContain("flex-none");
  });
});

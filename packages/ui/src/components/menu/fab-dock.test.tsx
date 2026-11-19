import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FabDock, type DockItem } from "./fab-dock";
import { MorphPanel } from "./morph-panel";

const labels = { open: "Abrir menú", close: "Cerrar menú" };
const base = { menuLabel: "Menú", labels, onClose: () => {}, onToggle: () => {} };
const item = (id: string, extra: Partial<DockItem> = {}): DockItem => ({
  id,
  label: id,
  icon: <span />,
  onClick: () => {},
  ...extra,
});

describe("FabDock", () => {
  it("con carrito vacío es la hamburguesa; con artículos, verde con contador", () => {
    const { container, rerender } = render(<FabDock {...base} open={false} items={[]} />);
    expect(screen.getByRole("button", { name: "Abrir menú" }).className).not.toContain("bg-even-grass");
    expect(container.querySelector("#cart-badge")).toBeNull();
    rerender(<FabDock {...base} open={false} items={[]} count={3} countLabel={(n) => `${n} artículos`} />);
    expect(screen.getByRole("button", { name: "Abrir menú, 3 artículos" }).className).toContain("bg-even-grass");
    expect(container.querySelector("#cart-badge")?.textContent).toBe("3");
    expect(container.querySelector("#cart-icon")).not.toBeNull();
  });

  it("solo cuenta pendiente: se ilumina con ícono de cuenta, sin número y con la cuenta fijada", () => {
    const bill = { ...base, labels: { ...labels, pendingBill: "Cuenta pendiente" } };
    const { container } = render(
      <FabDock {...bill} open={false} pendingBill items={[item("cuenta", { bill: true, count: 4, countLabel: (n) => `${n} platillos` })]} />,
    );
    const main = screen.getByRole("button", { name: "Abrir menú, Cuenta pendiente" });
    expect(main.className).toContain("bg-even-grass");
    expect(container.querySelector("#cart-badge")).toBeNull();
    expect(screen.getByTestId("bill-dot").textContent).toBe("");
    // El botón de la cuenta está fijado (visible con el menú cerrado), resaltado y sin contador.
    const account = screen.getByRole("button", { name: "cuenta" });
    expect(account.closest("[inert]")).toBeNull();
    expect(account.className).toContain("bg-even-grass");
    expect(account.parentElement?.textContent).toBe("");
  });

  it("cuenta y carrito: gana el carrito (con número) y la cuenta queda sin resaltar", () => {
    const bill = { ...base, labels: { ...labels, pendingBill: "Cuenta pendiente" } };
    const { container } = render(
      <FabDock {...bill} open={false} pendingBill count={2} countLabel={(n) => `${n} artículos`} items={[item("cuenta", { bill: true })]} />,
    );
    expect(screen.getByRole("button", { name: "Abrir menú, 2 artículos" })).toBeTruthy();
    expect(container.querySelector("#cart-badge")?.textContent).toBe("2");
    expect(screen.queryByTestId("bill-dot")).toBeNull();
    const account = screen.getByRole("button", { name: "cuenta" });
    expect(account.className).not.toContain("bg-even-grass");
    expect(account.closest("[inert]")).not.toBeNull();
  });

  it("sin cuenta pendiente el botón de la cuenta no se resalta ni se fija, y sigue sin número", () => {
    render(<FabDock {...base} open={false} items={[item("cuenta", { bill: true, count: 4 })]} />);
    const account = screen.getByRole("button", { name: "cuenta" });
    expect(account.className).not.toContain("bg-even-grass");
    expect(account.closest("[inert]")).not.toBeNull();
    expect(account.parentElement?.textContent).toBe("");
  });

  it("tocar el botón de la cuenta pendiente llama a su onClick", async () => {
    const onClick = vi.fn();
    render(<FabDock {...base} open={false} pendingBill items={[item("cuenta", { bill: true, onClick })]} />);
    await userEvent.click(screen.getByRole("button", { name: "cuenta" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("las acciones plegables no son accesibles con el menú cerrado; las fijadas sí", () => {
    render(<FabDock {...base} open={false} items={[item("perfil"), item("pedido", { pinned: true })]} />);
    // jsdom no calcula `inert`: se comprueba el atributo en el contenedor plegable.
    expect(screen.getByRole("button", { name: "perfil" }).closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "pedido" }).closest("[inert]")).toBeNull();
  });

  it("abierto muestra todas las acciones y llama a su onClick", async () => {
    const onClick = vi.fn();
    render(<FabDock {...base} open items={[item("perfil", { onClick })]} />);
    await userEvent.click(screen.getByRole("button", { name: "perfil" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Cerrar menú" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("Escape cierra y no hay fondo que bloquee la página", async () => {
    const onClose = vi.fn();
    render(<FabDock {...base} open onClose={onClose} items={[item("perfil")]} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("fab-dock-backdrop")).toBeNull();
  });

  it("oculto no es accesible, y un elemento oculto no se pinta", () => {
    const { container } = render(<FabDock {...base} open={false} hidden items={[item("pedido", { pinned: true, hidden: true })]} />);
    expect(container.querySelector("#cart-icon")?.closest("[inert]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "pedido" })).toBeNull();
  });

  it("muestra la burbuja de un elemento fijado", () => {
    render(<FabDock {...base} open={false} items={[item("pepper", { pinned: true, bubble: "Hola, ¿necesitas algo?" })]} />);
    expect(screen.getByRole("status").textContent).toBe("Hola, ¿necesitas algo?");
  });

  it("con progreso pinta la barra de avance y el contador nombra el botón", () => {
    render(
      <FabDock
        {...base}
        open
        items={[item("pedidos", { count: 2, countLabel: (n) => `${n} pedidos`, progress: 0.4, progressLabel: "Avance" })]}
      />,
    );
    expect(screen.getByRole("button", { name: "pedidos, 2 pedidos" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Avance" }).getAttribute("aria-valuenow")).toBe("40");
  });
});

describe("MorphPanel", () => {
  it("no renderiza cerrado; abierto es un diálogo que se cierra con Escape o el fondo", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <MorphPanel open={false} onClose={onClose} layoutId="x" label="Pedido">contenido</MorphPanel>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<MorphPanel open onClose={onClose} layoutId="x" label="Pedido">contenido</MorphPanel>);
    expect(screen.getByRole("dialog", { name: "Pedido" }).textContent).toBe("contenido");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByTestId("morph-panel-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

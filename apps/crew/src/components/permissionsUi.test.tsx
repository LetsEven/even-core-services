// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../lib/demoMode", () => ({
  isDemoMode: () => false,
  demoStatus: { active: false, error: null },
}));

import OrderCard from "./OrderCard";
import NavBar from "../app/NavBar";
import {
  AuthContext,
  ROLE_PERMISSIONS,
  makeHasPermission,
  type AuthProvider,
  type Permission,
  type Role,
} from "../lib/auth";
import type { Order } from "../types";
import type { Branch } from "../services/api";

function authFor(role: Role, extra: Permission[] = []): AuthProvider {
  const user = {
    id: "u",
    name: "Test",
    role,
    permissions: [...ROLE_PERMISSIONS[role], ...extra],
  };
  return {
    kind: "local",
    status: "signedIn",
    user,
    getToken: async () => "t",
    signOut: async () => {},
    hasPermission: makeHasPermission(user),
  };
}

const branch = { id: "b", name: "S", branch_number: 1, restaurant_id: 1 } as Branch;
const dish = (over = {}) => ({
  id: "d1", item: "Ceviche", quantity: 1, status: "preparing", paymentStatus: "pending", ...over,
});
const flexOrder = {
  id: "o1",
  orderType: "flex_bill",
  identifier: "Mesa 5",
  createdAt: new Date().toISOString(),
  totalAmount: 100,
  paidAmount: 0,
  remainingAmount: 100,
  dishes: [dish()],
} as unknown as Order;
const pickOrder = {
  id: "o2",
  orderType: "pick_and_go",
  identifier: "P1",
  createdAt: new Date().toISOString(),
  cookingStatus: "preparing",
  dishes: [dish()],
} as unknown as Order;

function renderCard(role: Role, order: Order, props: { readOnly?: boolean } = {}, extra: Permission[] = []) {
  render(
    <AuthContext.Provider value={authFor(role, extra)}>
      <MemoryRouter>
        <OrderCard
          order={order}
          onDishStatusChange={() => {}}
          onOrderCookingStatusChange={() => {}}
          currentBranch={branch}
          {...props}
        />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

afterEach(cleanup);

describe("cobro por permiso cuenta.cobrar", () => {
  it.each<Role>(["mesero", "cajero", "super"])("%s ve Registrar pago", (role) => {
    renderCard(role, flexOrder);
    expect(screen.getByText("Registrar pago")).toBeTruthy();
  });

  it("cocina no cobra", () => {
    renderCard("cocina", flexOrder);
    expect(screen.queryByText("Registrar pago")).toBeNull();
  });
});

describe("Cocina de solo lectura (sin cocina.operar)", () => {
  it("los botones de estado del platillo y de la orden quedan deshabilitados", () => {
    renderCard("cocina", pickOrder, { readOnly: true });
    const buttons = screen.getAllByRole("button", { name: /Preparando|Listo|Entregado/ });
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("en cuentas de mesa tambien se deshabilitan los estados del platillo", () => {
    renderCard("cocina", flexOrder, { readOnly: true });
    const buttons = screen.getAllByRole("button", { name: /^(Preparando|Listo|Entregado)$/ });
    expect(buttons.length).toBe(3);
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("con cocina.operar los controles siguen activos", () => {
    renderCard("cocina", pickOrder, { readOnly: false }, ["cocina.operar"]);
    const ready = screen.getByRole("button", { name: "Listo" }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
  });
});

describe("navegacion filtrada por rol", () => {
  const links = (role: Role) => {
    render(
      <AuthContext.Provider value={authFor(role)}>
        <MemoryRouter>
          <NavBar />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    const names = screen.getAllByRole("link").map((a) => a.textContent);
    cleanup();
    return names;
  };

  it("cada rol ve solo sus destinos", () => {
    expect(links("super")).toEqual(["Mesas", "Cocina", "Caja", "Ajustes"]);
    expect(links("cajero")).toEqual(["Mesas", "Caja"]);
    expect(links("mesero")).toEqual(["Mesas"]);
    expect(links("cocina")).toEqual(["Cocina"]);
  });
});

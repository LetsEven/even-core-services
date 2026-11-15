// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Order } from "../types";
import { handleDemoRequest } from "./handlers";
import { createDemoFetch } from "./fetch";
import { createDemoStore, type DemoStore } from "./store";

const R = "/api/restaurants/26/branches/1";

function call(store: DemoStore, method: string, url: string, body?: unknown) {
  return handleDemoRequest(store, { method, url, body });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: { json?: unknown }) => r.json as any;
const activeOrders = (s: DemoStore): Order[] => json(call(s, "GET", "/api/kitchen/orders")).orders;
const newStore = () => createDemoStore();

const COMANDA = {
  guestName: "MESERO - Luis Hernández",
  items: [
    { item: "Ceviche de camarón", quantity: 2, price: 145, extraPrice: 25, menuItemId: 101 },
    { item: "Cerveza", quantity: 1, price: 55, menuItemId: 403 },
  ],
};

describe("demo: abrir mesa y agregar platillos", () => {
  it("la mesa libre se ocupa y la orden aparece en /orders", () => {
    const s = newStore();
    const tables = () => json(call(s, "GET", "/api/kitchen/tables?branchId=demo-branch-1")).tables;
    expect(tables().find((t: { table_number: string }) => t.table_number === "1")).toMatchObject({
      status: "available",
      has_open_account: false,
    });
    expect(activeOrders(s).some((o) => o.identifier === "Mesa 1")).toBe(false);

    const res = call(s, "POST", `${R}/tables/1/dishes/bulk`, COMANDA);
    expect(res.status).toBe(200);
    const orderId = json(res).data.table_order_id;

    const order = activeOrders(s).find((o) => o.id === orderId)!;
    expect(order.identifier).toBe("Mesa 1");
    expect(order.orderType).toBe("flex_bill");
    expect(order.dishes).toHaveLength(2);
    expect(order.dishes.every((d) => d.status === "preparing")).toBe(true);
    expect(order.totalAmount).toBe(2 * (145 + 25) + 55);
    expect(order.remainingAmount).toBe(order.totalAmount);
    expect(tables().find((t: { table_number: string }) => t.table_number === "1")).toMatchObject({
      status: "occupied",
      has_open_account: true,
    });
  });

  it("agregar a una mesa abierta reutiliza la cuenta y emite el ticket de cocina", () => {
    const s = newStore();
    const jobs: unknown[] = [];
    s.subscribe((e) => e.name === "kitchen:print_job" && jobs.push(e.data));
    const first = json(call(s, "POST", `${R}/tables/1/dishes/bulk`, COMANDA)).data.table_order_id;
    const second = json(
      call(s, "POST", `${R}/tables/1/dishes/bulk`, {
        guestName: "MESERO",
        items: [{ item: "Michelada", quantity: 1, price: 80, menuItemId: 404 }],
      }),
    ).data.table_order_id;
    expect(second).toBe(first);
    expect(activeOrders(s).find((o) => o.id === first)!.dishes).toHaveLength(3);
    expect(jobs).toHaveLength(2);
    // Cerveza va a barra (1), ceviche a cocina (2)
    expect((jobs[0] as { items: { clasificacion: number }[] }).items.map((i) => i.clasificacion)).toEqual([2, 1]);
  });

  it("rechaza mesas en mantenimiento y comandas vacias", () => {
    const s = newStore();
    expect(call(s, "POST", `${R}/tables/10/dishes/bulk`, COMANDA).status).toBe(409);
    expect(call(s, "POST", `${R}/tables/1/dishes/bulk`, { guestName: "x", items: [] }).status).toBe(400);
  });
});

describe("demo: cobro", () => {
  function pay(s: DemoStore, order: Order, amount: number, tip = 0) {
    expect(
      call(s, "POST", "/api/payment-transactions", {
        id_table_order: order.id,
        base_amount: amount,
        tip_amount: tip,
        total_amount_charged: amount + tip,
        transaction_by: "MESERO",
        payment_source: "cash",
      }).status,
    ).toBe(200);
    expect(
      call(s, "POST", `${R}/tables/${order.identifier.replace("Mesa ", "")}/pay`, {
        amount,
        guestName: "MESERO",
      }).status,
    ).toBe(200);
  }

  it("un pago parcial baja el restante, queda en pagos y en comprobantes", () => {
    const s = newStore();
    const order = activeOrders(s).find((o) => o.identifier === "Mesa 7")!;
    const before = order.remainingAmount!;
    pay(s, order, 200, 20);

    const after = activeOrders(s).find((o) => o.id === order.id)!;
    expect(after.remainingAmount).toBe(before - 200);
    expect(after.paidAmount).toBe(200);
    expect(after.payments).toHaveLength(1);
    expect(json(call(s, "GET", `${R}/tables/7/summary`)).data).toMatchObject({
      paid_amount: 200,
      remaining_amount: before - 200,
      status: "partial",
    });

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const until = new Date(Date.now() + 3_600_000).toISOString();
    const v = json(call(s, "GET", `/api/vouchers?since=${since}&until=${until}&page=1&limit=15`)).data;
    expect(v.data.some((x: { locationLabel: string; total_amount_charged: number }) => x.locationLabel === "Mesa 7" && x.total_amount_charged === 220)).toBe(true);
  });

  it("saldar la cuenta cierra la orden, libera la mesa y la manda a Caja", () => {
    const s = newStore();
    const order = activeOrders(s).find((o) => o.identifier === "Mesa 7")!;
    pay(s, order, order.remainingAmount!);

    expect(activeOrders(s).some((o) => o.id === order.id)).toBe(false);
    const tables = json(call(s, "GET", "/api/kitchen/tables")).tables;
    expect(tables.find((t: { table_number: string }) => t.table_number === "7")).toMatchObject({
      status: "available",
      has_open_account: false,
    });
    const hist = json(call(s, "GET", "/api/kitchen/orders/history")).orders as Order[];
    expect(hist.find((o) => o.id === order.id)).toMatchObject({ remainingAmount: 0, status: "paid" });
  });

  it("cobrar platillos seleccionados marca esos platillos como pagados", () => {
    const s = newStore();
    const order = activeOrders(s).find((o) => o.identifier === "Mesa 2")!;
    const dish = order.dishes[0];
    expect(call(s, "POST", `/api/dishes/${dish.id}/pay`, { guestName: "MESERO" }).status).toBe(200);
    const after = activeOrders(s).find((o) => o.id === order.id)!;
    expect(after.dishes[0].paymentStatus).toBe("paid");
    expect(after.paidAmount).toBe(dish.price! * dish.quantity);
    const unpaid = json(call(s, "GET", `${R}/tables/2/orders`)).data.filter(
      (d: { payment_status: string }) => d.payment_status === "not_paid",
    );
    expect(unpaid).toHaveLength(order.dishes.length - 1);
  });

  it("un cobro mayor al restante se topa al restante (no cobra de mas)", () => {
    const s = newStore();
    const order = activeOrders(s).find((o) => o.identifier === "Mesa 7")!;
    const res = call(s, "POST", `${R}/tables/7/pay`, {
      amount: order.remainingAmount! + 500,
      guestName: "MESERO",
    });
    expect(res.status).toBe(200); // se topa al restante, no cobra de mas
    expect(activeOrders(s).some((o) => o.id === order.id)).toBe(false);
  });
});

describe("demo: otras mutaciones", () => {
  it("cambiar estado de platillo se refleja y queda en movimientos", () => {
    const s = newStore();
    const order = activeOrders(s).find((o) => o.identifier === "Mesa 2")!;
    const preparing = order.dishes.find((d) => d.status === "preparing")!;
    expect(
      call(s, "PATCH", `/api/dish-orders/${preparing.id}/status`, { status: "ready", waiterName: "Luis" }).status,
    ).toBe(200);
    expect(activeOrders(s).find((o) => o.id === order.id)!.dishes.find((d) => d.id === preparing.id)!.status).toBe("ready");
    const movs = json(call(s, "GET", `/api/kitchen/orders/flex_bill/${order.id}/movements`)).movements;
    expect(movs.at(-1)).toMatchObject({ type: "dish_status_changed" });
  });

  it("asignar mesero y reordenar mesas", () => {
    const s = newStore();
    const order = activeOrders(s).find((o) => o.identifier === "Mesa 6")!;
    call(s, "PATCH", `/api/kitchen/orders/flex_bill/${order.id}/waiter`, { waiterName: "Carlos Ruiz", waiterId: "103" });
    expect(activeOrders(s).find((o) => o.id === order.id)).toMatchObject({ waiterName: "Carlos Ruiz", waiterId: "103" });

    const ids = json(call(s, "GET", "/api/kitchen/tables")).tables.map((t: { id: string }) => t.id) as string[];
    const reversed = [...ids].reverse();
    call(s, "PUT", "/api/kitchen/tables/reorder", {
      branchId: "demo-branch-1",
      tables: reversed.map((id, i) => ({ id, display_order: i })),
    });
    expect(json(call(s, "GET", "/api/kitchen/tables")).tables.map((t: { id: string }) => t.id)).toEqual(reversed);
  });

  it("eliminar el ultimo platillo de una cuenta nueva la borra y libera la mesa", () => {
    const s = newStore();
    call(s, "POST", `${R}/tables/1/dishes/bulk`, {
      guestName: "MESERO",
      items: [{ item: "Michelada", quantity: 1, price: 80, menuItemId: 404 }],
    });
    const o = activeOrders(s).find((x) => x.identifier === "Mesa 1")!;
    const res = call(s, "PATCH", `/api/dishes/${o.dishes[0].id}/quantity`, { quantity: 0 });
    expect(json(res).data).toEqual({ quantity: 0, removed: true });
    expect(activeOrders(s).some((x) => x.identifier === "Mesa 1")).toBe(false);
  });

  it("meseros con contraseña vacia y ticket de POS que se trae a Even", () => {
    const s = newStore();
    expect(json(call(s, "POST", "/api/kitchen/waiters/verify", { idmesero: "101", password: "" })).match).toBe(true);
    expect(json(call(s, "POST", "/api/kitchen/waiters/verify", { idmesero: "101", password: "x" })).match).toBe(false);

    const peek = json(call(s, "GET", "/api/kitchen/tables/pos-peek-batch?branchId=demo-branch-1")).tables;
    expect(peek.find((t: { table_number: string }) => t.table_number === "11").hasPOSOrder).toBe(true);
    expect(call(s, "POST", "/api/kitchen/tables/11/open?branchId=demo-branch-1").status).toBe(200);
    expect(activeOrders(s).some((o) => o.identifier === "Mesa 11")).toBe(true);
  });

  it("menu con un platillo agotado y comprobante en PDF", () => {
    const s = newStore();
    const menu = json(call(s, "GET", "/api/restaurants/26/1/complete")).data.menu;
    expect(menu).toHaveLength(4);
    expect(menu.flatMap((m: { items: { is_out_of_stock?: boolean }[] }) => m.items).some((i: { is_out_of_stock?: boolean }) => i.is_out_of_stock)).toBe(true);
    const v = json(call(s, "GET", "/api/vouchers?since=2000-01-01T00:00:00Z&until=2100-01-01T00:00:00Z&page=1&limit=1")).data;
    const pdf = call(s, "GET", `/api/vouchers/${v.data[0].id}/pdf?restaurantId=26`);
    expect(pdf.status).toBe(200);
    expect(new TextDecoder().decode(pdf.pdf!.slice(0, 5))).toBe("%PDF-");
  });
});

describe("demo: endpoints sin fixture y wrapper de fetch", () => {
  it("responde 404 con mensaje claro y avisa en consola", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = call(newStore(), "GET", "/api/no/existe");
    expect(r.status).toBe(404);
    expect(json(r).message).toContain("demo: endpoint sin fixture");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("demo: endpoint sin fixture"));
    warn.mockRestore();
  });

  it("intercepta /api/ sin tocar la red y deja pasar lo demas", async () => {
    const real = vi.fn(async () => new Response("real"));
    const f = createDemoFetch(real as unknown as typeof fetch, newStore(), {
      latencyMs: 0,
      baseUrl: "https://dev.example.com",
    });
    for (const url of [
      "https://dev.example.com/api/kitchen/branches",
      "undefined/api/kitchen/branches",
      "/api/kitchen/branches",
    ]) {
      const res = await f(url, { headers: { Authorization: "Bearer x" } });
      expect(res.ok).toBe(true);
      expect((await res.json()).branches[0].name).toContain("Mazatlán");
    }
    expect(real).not.toHaveBeenCalled();

    const res = await f("/assets/logo.svg");
    expect(await res.text()).toBe("real");
    await f("https://fcm.googleapis.com/v1/x");
    expect(real).toHaveBeenCalledTimes(2);
  });

  it("las mutaciones por fetch llegan al store (POST con body JSON)", async () => {
    const s = newStore();
    const f = createDemoFetch(vi.fn() as unknown as typeof fetch, s, { latencyMs: 0 });
    const res = await f(`undefined${R}/tables/1/dishes/bulk`, {
      method: "POST",
      body: JSON.stringify(COMANDA),
    });
    expect(res.status).toBe(200);
    expect(activeOrders(s).some((o) => o.identifier === "Mesa 1")).toBe(true);
    const bad = await f("/api/nada", { method: "GET" });
    expect(bad.status).toBe(404);
  });
});

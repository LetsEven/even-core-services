// Tabla de endpoints de Crew -> fixtures + store en memoria. Un solo punto de
// entrada (handleDemoRequest) que usa el wrapper de fetch; no toca la red.
import type { BulkDishItem, PrinterRecord } from "../services/api";
import type { DishStatus } from "../types";
import { DemoError, type DemoStore, type ManualTransactionBody } from "./store";
import { buildSimplePdf } from "./pdf";

export interface DemoRequest {
  method: string;
  /** Ruta con query, empezando en /api/... */
  url: string;
  body?: unknown;
}

export interface DemoResult {
  status: number;
  json?: unknown;
  pdf?: Uint8Array;
}

interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  store: DemoStore;
}

type Handler = (ctx: Ctx) => unknown | DemoResult;

interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  handler: Handler;
}

const routes: Route[] = [];

function on(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const source = path.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
    keys.push(k);
    return "([^/]+)";
  });
  routes.push({ method, re: new RegExp(`^${source}$`), keys, handler });
}

const ok = { success: true };
const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

function toBulkItem(i: Record<string, any>): BulkDishItem { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    item: str(i.item),
    quantity: num(i.quantity, 1),
    price: num(i.price),
    extraPrice: num(i.extraPrice),
    customFields: Array.isArray(i.customFields) ? i.customFields : [],
    menuItemId: typeof i.menuItemId === "number" ? i.menuItemId : undefined,
    specialInstructions: typeof i.specialInstructions === "string" ? i.specialInstructions : null,
    images: Array.isArray(i.images) ? i.images : [],
  };
}

// ---------- sucursales, ordenes e historial ----------
on("GET", "/api/kitchen/branches", ({ store }) => ({ branches: [store.branch] }));
on("GET", "/api/kitchen/orders", ({ store }) => ({ orders: store.activeOrders() }));
on("GET", "/api/kitchen/orders/history", ({ store, query }) => ({
  orders: store.historyOrders(query.get("since"), query.get("until")),
}));
on("GET", "/api/kitchen/orders/history/available-months", ({ store }) => ({
  months: store.availableMonths(),
}));
on("GET", "/api/kitchen/orders/flex_bill/:id/movements", ({ store, params }) => ({
  movements: store.movementsFor(params.id),
}));
on("PATCH", "/api/kitchen/orders/:type/:id/waiter", ({ store, params, body }) => ({
  order: store.setOrderWaiter(params.id, str(body.waiterName, "EVEN"), body.waiterId ?? undefined),
}));
on("POST", "/api/kitchen/orders/:type/:id/reprint", ({ store, params }) => {
  store.emit("kitchen:print_job", store.reprintJob(params.id));
  return ok;
});

// ---------- estado de platillos ----------
const setStatus: Handler = ({ store, params, body }) => {
  store.setDishStatus(params.id, str(body.status) as DishStatus, { name: body.waiterName });
  return ok;
};
on("PATCH", "/api/dish-orders/:id/status", setStatus);
on("PUT", "/api/tap-pay/dishes/:id/status", setStatus);
on("PUT", "/api/pick-and-go/dishes/:id/status", setStatus);
// Pick & Go no esta contratado en la sucursal demo: no hay ordenes que tocar.
const noPickAndGo: Handler = () => {
  throw new DemoError(404, "Pick & Go no esta contratado en la sucursal demo");
};
on("PUT", "/api/pick-and-go/orders/:id/cooking-status", noPickAndGo);
on("PUT", "/api/pick-and-go/orders/:id/prep-time-extra", noPickAndGo);
on("PATCH", "/api/dishes/:id/quantity", ({ store, params, body }) => ({
  data: store.setDishQuantity(params.id, num(body.quantity), { name: body.waiterName }),
}));

// ---------- notificaciones push (sin efecto en demo) ----------
on("POST", "/api/kitchen/fcm-token", () => ok);
on("DELETE", "/api/kitchen/fcm-token", () => ok);

// ---------- impresoras ----------
on("GET", "/api/pos/branch/:branchId/printers", ({ store }) => ({ printers: store.printers() }));
on("POST", "/api/kitchen/printers/sync", ({ store }) => ({ printers: store.printers() }));
on("PUT", "/api/kitchen/printers/:id", ({ store, params, body }) => ({
  printer: store.updatePrinter(params.id, body as Partial<PrinterRecord>),
}));
on("DELETE", "/api/kitchen/printers/:id", ({ store, params }) => {
  store.deletePrinter(params.id);
  return ok;
});

// ---------- mesas y croquis ----------
on("GET", "/api/kitchen/tables", ({ store }) => ({ tables: store.listTables() }));
on("GET", "/api/kitchen/rooms", () => ({ rooms: [] }));
on("PUT", "/api/kitchen/tables/reorder", ({ store, body }) => {
  store.reorderTables(Array.isArray(body.tables) ? body.tables : []);
  return ok;
});
on("PUT", "/api/kitchen/rooms/reorder", () => ok);
on("GET", "/api/kitchen/branches/:id/qr-codes", ({ store }) => ({ qrCodes: store.qrCodes() }));
on("GET", "/api/kitchen/tables/pos-peek-batch", ({ store }) => ({ tables: store.posPeekBatch() }));
on("GET", "/api/kitchen/tables/:n/pos-peek", ({ store, params }) => ({
  hasPOSOrder: !!store.posTicketFor(params.n),
}));
on("GET", "/api/kitchen/tables/:n/pos-check", ({ store, params }) => {
  const t = store.posTicketFor(params.n);
  return {
    order: t
      ? {
          service: "flex_bill",
          label: "Flex Bill",
          total: t.items.reduce((s, i) => s + i.price * i.quantity, 0),
          status: "pos",
        }
      : null,
  };
});
on("POST", "/api/kitchen/tables/:n/open", ({ store, params }) => ({
  order: store.openFromPos(params.n),
}));
on("GET", "/api/kitchen/tables/:n/summary", ({ store, params }) => ({
  order: store.summaryForTable(params.n),
}));
on("POST", "/api/tap-pay/orders/:id/sync-from-pos", () => ok);
on("POST", "/api/restaurants/:r/branches/:b/tables/:t/sync-from-pos", () => ok);

// ---------- meseros ----------
on("GET", "/api/kitchen/waiters", ({ store }) => ({ waiters: store.waiters() }));
on("POST", "/api/kitchen/waiters/verify", ({ store, body }) => ({
  match: store.verifyWaiter(str(body.idmesero), str(body.password)),
}));

// ---------- menu y comanda ----------
on("GET", "/api/restaurants/:r/:b/complete", ({ store }) => ({ data: { menu: store.menu() } }));
on("POST", "/api/restaurants/:r/branches/:b/tables/:t/dishes/bulk", ({ store, params, body }) => {
  const items = Array.isArray(body.items) ? body.items.map(toBulkItem) : [];
  return { data: store.addDishes(params.t, items, str(body.guestName, "MESERO")) };
});
on("POST", "/api/restaurants/:r/branches/:b/tables/:t/dishes", ({ store, params, body }) => {
  store.addDishes(params.t, [toBulkItem(body)], str(body.guestName, "MESERO"));
  return ok;
});

// ---------- cuenta y cobro ----------
on("GET", "/api/restaurants/:r/branches/:b/tables/:t/summary", ({ store, params }) => ({
  data: store.tableSummary(params.t),
}));
on("GET", "/api/restaurants/:r/branches/:b/tables/:t/orders", ({ store, params }) => ({
  data: store.tableDishOrders(params.t),
}));
on("POST", "/api/restaurants/:r/branches/:b/tables/:t/pay", ({ store, params, body }) => {
  store.payAmount({ table: params.t }, num(body.amount), str(body.guestName, "MESERO"));
  return ok;
});
on("POST", "/api/dishes/:id/pay", ({ store, params, body }) => {
  store.payDish(params.id, str(body.guestName, "MESERO"));
  return ok;
});
on("POST", "/api/tap-pay/dishes/:id/pay", ({ store, params, body }) => {
  store.payDish(params.id, str(body.guestName, "MESERO"));
  return ok;
});
on("POST", "/api/tap-pay/orders/:id/pay-amount", ({ store, params, body }) => {
  store.payAmount({ orderId: params.id }, num(body.amount), str(body.guestName, "MESERO"));
  return ok;
});
on("POST", "/api/payment-transactions", ({ store, body }) => {
  store.recordTransaction(body as unknown as ManualTransactionBody);
  return ok;
});

// ---------- comprobantes ----------
on("GET", "/api/vouchers", ({ store, query }) => ({
  data: store.listVouchers(
    query.get("since") ?? new Date(0).toISOString(),
    query.get("until") ?? new Date(8.64e15).toISOString(),
    Math.max(1, Number(query.get("page") ?? 1)),
    Math.max(1, Number(query.get("limit") ?? 15)),
  ),
}));
on("GET", "/api/vouchers/:id/pdf", ({ store, params }) => {
  const v = store.voucherById(params.id);
  if (!v) throw new DemoError(404, "Comprobante no encontrado");
  const money = (n: number) => `$${n.toFixed(2)} MXN`;
  return {
    status: 200,
    pdf: buildSimplePdf([
      "MARISCOS MAZATLAN (DEMO)",
      "Comprobante ficticio - sin validez",
      "",
      `${v.service} - ${v.locationLabel ?? ""}`,
      `Sucursal: ${v.branchName ?? ""}`,
      `Fecha: ${new Date(v.created_at).toLocaleString("es-MX")}`,
      `Metodo: ${v.paymentMethod}`,
      "",
      `Consumo: ${money(v.base_amount)}`,
      `Propina: ${money(v.tip_amount)}`,
      `Total: ${money(v.total_amount_charged)}`,
    ]),
  } satisfies DemoResult;
});

// ---------- despacho ----------

export function handleDemoRequest(store: DemoStore, req: DemoRequest): DemoResult {
  const parsed = new URL(req.url, "http://demo.local");
  const path = parsed.pathname.replace(/\/+$/, "");
  const method = req.method.toUpperCase();

  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1]);
    });
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, any>) : {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const out = r.handler({ params, query: parsed.searchParams, body, store });
      if (out && typeof out === "object" && "status" in out && ("pdf" in out || "json" in out)) {
        return out as DemoResult;
      }
      return { status: 200, json: out };
    } catch (e) {
      if (e instanceof DemoError) {
        return { status: e.status, json: { error: e.message, message: e.message } };
      }
      console.error("demo: error en handler", method, path, e);
      return {
        status: 500,
        json: { error: "demo: error interno", message: String(e) },
      };
    }
  }

  console.warn(`demo: endpoint sin fixture — ${method} ${path}`);
  return {
    status: 404,
    json: {
      error: "demo: endpoint sin fixture",
      message: `demo: endpoint sin fixture (${method} ${path})`,
    },
  };
}

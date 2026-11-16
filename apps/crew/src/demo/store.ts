// Estado en memoria del modo demo. Las mutaciones (abrir mesa, agregar
// platillos, cambiar estado, cobrar, asignar mesero, reordenar) actualizan este
// estado y las pantallas lo reflejan al volver a pedir los datos. Se pierde al
// recargar la pagina.
import type {
  CustomField,
  DishStatus,
  Movement,
  MovementType,
  Order,
  OrderType,
  PaymentTransaction,
} from "../types";
import type {
  BulkDishItem,
  MenuItem,
  PrinterRecord,
  QRCodeRow,
  TableActiveSummary,
  TableRow,
  Voucher,
} from "../services/api";
import type { PrintJobData } from "../hooks/usePrinting";
import {
  CLASSIFICATION_BY_SECTION,
  DEMO_BRANCH,
  DEMO_BRANCH_ID,
  DEMO_MAINTENANCE_TABLE,
  DEMO_MENU,
  DEMO_POS_TABLE,
  DEMO_TABLE_NUMBERS,
  DEMO_WAITERS,
  demoPrinters,
} from "./fixtures";

export type DemoOrderType = Extract<OrderType, "flex_bill" | "tap" | "tap_pay">;

interface DemoDish {
  id: string;
  item: string;
  quantity: number;
  /** Precio unitario base (con descuento), sin extras. */
  unitPrice: number;
  extraPrice: number;
  status: DishStatus;
  images: string[];
  guestName: string;
  customFields: CustomField[] | null;
  specialInstructions: string | null;
  paymentStatus: "paid" | "not_paid";
  menuItemId: number | null;
}

interface DemoOrder {
  id: string;
  orderType: DemoOrderType;
  table: string;
  folio: string;
  waiterName: string | null;
  waiterId: string | null;
  createdAt: string;
  closedAt: string | null;
  dishes: DemoDish[];
  payments: PaymentTransaction[];
  paidAmount: number;
  movements: Movement[];
}

interface DemoTable {
  id: string;
  number: string;
  displayOrder: number;
  maintenance: boolean;
}

interface PosTicket {
  table: string;
  items: BulkDishItem[];
  guestName: string;
}

export interface DemoEvent {
  name: string;
  data: unknown;
}

export interface ManualTransactionBody {
  id_table_order?: string;
  id_tap_pay_order?: string;
  base_amount: number;
  tip_amount: number;
  total_amount_charged: number;
  transaction_by: string;
  payment_source: "cash" | "terminal";
  manual_card_type?: string | null;
}

export class DemoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const lineTotal = (d: DemoDish) => round2((d.unitPrice + d.extraPrice) * d.quantity);

export function serviceLabel(t: DemoOrderType): string {
  return t === "flex_bill" ? "Flex Bill" : t === "tap" ? "Tap Order & Pay" : "Tap & Pay";
}

function findMenuItem(menuItemId: number | null | undefined): MenuItem | undefined {
  if (menuItemId == null) return undefined;
  for (const s of DEMO_MENU) {
    const it = s.items.find((i) => i.id === menuItemId);
    if (it) return it;
  }
  return undefined;
}

function classificationOf(menuItemId: number | null): number {
  const mi = findMenuItem(menuItemId);
  return mi ? (CLASSIFICATION_BY_SECTION[mi.section_id] ?? 2) : 2;
}

function printCustomFields(d: DemoDish) {
  return (d.customFields ?? []).map((f) => ({
    fieldName: f.fieldName,
    selectedOptions: (f.selectedOptions ?? []).map((s) => ({
      optionName: s.optionName,
    })),
  }));
}

function priceAfterDiscount(item: MenuItem): number {
  return round2(item.discount > 0 ? item.price * (1 - item.discount / 100) : item.price);
}

export function createDemoStore(options: { now?: () => number; seed?: boolean } = {}) {
  const now = options.now ?? (() => Date.now());
  const iso = (ms = now()) => new Date(ms).toISOString();
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;
  let folioSeq = 1040;
  const nextFolio = () => String(++folioSeq);

  const orders: DemoOrder[] = [];
  const vouchers: (Voucher & { orderId: string })[] = [];
  let printers: PrinterRecord[] = demoPrinters(iso());
  const tables: DemoTable[] = DEMO_TABLE_NUMBERS.map((n, i) => ({
    id: `demo-table-${n}`,
    number: n,
    displayOrder: i,
    maintenance: n === DEMO_MAINTENANCE_TABLE,
  }));
  const posTickets: PosTicket[] = [];
  const lastTx = new Map<string, ManualTransactionBody>();
  const listeners = new Set<(e: DemoEvent) => void>();

  function emit(name: string, data: unknown) {
    for (const l of listeners) l({ name, data });
  }
  function subscribe(fn: (e: DemoEvent) => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  // ---------- helpers de orden ----------

  const totalOf = (o: DemoOrder) => round2(o.dishes.reduce((s, d) => s + lineTotal(d), 0));
  const remainingOf = (o: DemoOrder) => Math.max(0, round2(totalOf(o) - o.paidAmount));

  function addMovement(
    o: DemoOrder,
    type: MovementType,
    details: Record<string, unknown>,
    actorLabel: string | null = null,
  ) {
    o.movements.push({
      id: nextId("mv"),
      type,
      actorLabel,
      details,
      createdAt: iso(),
    });
  }

  function toOrder(o: DemoOrder): Order {
    const total = totalOf(o);
    const remaining = remainingOf(o);
    const isFlex = o.orderType === "flex_bill";
    return {
      id: o.id,
      orderType: o.orderType,
      identifier: `Mesa ${o.table}`,
      createdAt: o.createdAt,
      folio: o.folio,
      status: remaining <= 0.005 && o.dishes.length > 0 ? "paid" : "not_paid",
      totalAmount: total,
      paidAmount: o.paidAmount,
      remainingAmount: remaining,
      totalDisplayAmount: isFlex ? total : null,
      paidDisplayAmount: isFlex ? o.paidAmount : null,
      remainingDisplayAmount: isFlex ? remaining : null,
      payments: o.payments,
      waiterName: o.waiterName,
      waiterId: o.waiterId,
      dishes: o.dishes.map((d) => ({
        id: d.id,
        item: d.item,
        quantity: d.quantity,
        status: d.status,
        images: d.images,
        orderedBy: d.guestName,
        userFolio: o.folio,
        customFields: d.customFields,
        specialInstructions: d.specialInstructions,
        price: round2(d.unitPrice + d.extraPrice),
        paymentStatus: d.paymentStatus,
      })),
    };
  }

  const openOrderFor = (table: string) =>
    orders.find((o) => o.table === table && o.closedAt === null);

  function mustOrder(id: string): DemoOrder {
    const o = orders.find((x) => x.id === id);
    if (!o) throw new DemoError(404, "Orden no encontrada");
    return o;
  }

  function orderByTable(table: string): DemoOrder {
    const o = openOrderFor(table);
    if (!o) throw new DemoError(404, `La mesa ${table} no tiene cuenta abierta`);
    return o;
  }

  function dishLocation(dishId: string): { order: DemoOrder; dish: DemoDish } {
    for (const order of orders) {
      const dish = order.dishes.find((d) => d.id === dishId);
      if (dish) return { order, dish };
    }
    throw new DemoError(404, "Platillo no encontrado");
  }

  function closeIfPaid(o: DemoOrder) {
    if (o.closedAt || o.dishes.length === 0) return;
    if (remainingOf(o) > 0.005) return;
    // Flex Bill / Tap & Pay: la mesa se libera al saldar. Tap Order & Pay
    // (prepagada) se cierra cuando se entrega todo.
    const allDelivered = o.dishes.every((d) => d.status === "delivered");
    if (o.orderType === "tap" && !allDelivered) return;
    o.closedAt = iso();
    addMovement(o, "table_closed", {});
  }

  // ---------- consultas ----------

  function activeOrders(): Order[] {
    return orders.filter((o) => o.closedAt === null).map(toOrder);
  }

  function historyOrders(since?: string | null, until?: string | null): Order[] {
    const from = since ? Date.parse(since) : -Infinity;
    const to = until ? Date.parse(until) : Infinity;
    return orders
      .filter((o) => o.closedAt !== null || o.payments.length > 0)
      .filter((o) => {
        const t = Date.parse(o.closedAt ?? o.createdAt);
        return t >= from && t <= to;
      })
      .sort((a, b) => Date.parse(b.closedAt ?? b.createdAt) - Date.parse(a.closedAt ?? a.createdAt))
      .map(toOrder);
  }

  function availableMonths(): string[] {
    const set = new Set<string>();
    for (const o of orders) {
      if (o.closedAt === null && o.payments.length === 0) continue;
      const d = new Date(o.closedAt ?? o.createdAt);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return [...set].sort().reverse();
  }

  function listTables(): TableRow[] {
    return [...tables]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((t) => {
        const open = openOrderFor(t.number);
        return {
          id: t.id,
          table_number: t.number,
          status: t.maintenance ? "maintenance" : open ? "occupied" : "available",
          has_open_account: !!open,
          has_tap_pay_account: open?.orderType === "tap_pay",
        };
      });
  }

  function reorderTables(items: { id: string; display_order: number }[]) {
    for (const it of items) {
      const t = tables.find((x) => x.id === it.id);
      if (t) t.displayOrder = it.display_order;
    }
  }

  function qrCodes(): QRCodeRow[] {
    return tables.map((t) => ({
      id: `demo-qr-${t.number}`,
      code: `DEMO-MZT-${t.number}`,
      table_number: t.number,
      service: "tap_pay",
    }));
  }

  function posPeekBatch(): { table_number: string; hasPOSOrder: boolean }[] {
    return listTables()
      .filter((t) => !t.has_open_account && t.status !== "maintenance")
      .map((t) => ({
        table_number: t.table_number,
        hasPOSOrder: posTickets.some((p) => p.table === t.table_number),
      }));
  }

  function posTicketFor(table: string) {
    return posTickets.find((p) => p.table === table);
  }

  function summaryFor(o: DemoOrder): TableActiveSummary {
    return {
      service: o.orderType,
      label: serviceLabel(o.orderType),
      total: totalOf(o),
      status: o.closedAt ? "paid" : "open",
      folio: o.folio,
      paid_amount: o.paidAmount,
      remaining_amount: remainingOf(o),
      dishes: o.dishes.map((d) => ({
        item: d.item,
        quantity: d.quantity,
        status: d.status,
        payment_status: d.paymentStatus,
      })),
      payments: o.payments.map((p) => ({
        guestName: p.guestName ?? null,
        baseAmount: p.baseAmount,
        tipAmount: p.tipAmount,
        cardType: p.cardType,
      })),
    };
  }

  function tableSummary(table: string) {
    const o = orderByTable(table);
    const total = totalOf(o);
    return {
      table_number: o.table,
      table_order_id: o.id,
      restaurant_id: DEMO_BRANCH.restaurant_id,
      branch_number: DEMO_BRANCH.branch_number,
      total_amount: total,
      paid_amount: o.paidAmount,
      remaining_amount: remainingOf(o),
      status: remainingOf(o) <= 0.005 ? "paid" : o.paidAmount > 0 ? "partial" : "not_paid",
    } as const;
  }

  function tableDishOrders(table: string) {
    const o = orderByTable(table);
    return o.dishes.map((d) => {
      const unit = round2(d.unitPrice + d.extraPrice);
      const total = lineTotal(d);
      return {
        dish_order_id: d.id,
        item: d.item,
        quantity: d.quantity,
        price: unit,
        total_price: total,
        display_price: unit,
        total_display_price: total,
        payment_status: d.paymentStatus,
        guest_name: d.guestName,
      };
    });
  }

  function movementsFor(orderId: string): Movement[] {
    return [...mustOrder(orderId).movements].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
  }

  function listVouchers(since: string, until: string, page: number, limit: number) {
    const from = Date.parse(since);
    const to = Date.parse(until);
    const inRange = vouchers
      .filter((v) => {
        const t = Date.parse(v.created_at);
        return t >= from && t <= to;
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const totalPages = Math.max(1, Math.ceil(inRange.length / limit));
    const slice = inRange.slice((page - 1) * limit, page * limit);
    return {
      data: slice.map((v) => publicVoucher(v)),
      total_pages: totalPages,
      total_results: inRange.length,
      page,
    };
  }

  function publicVoucher(v: Voucher & { orderId: string }): Voucher {
    return {
      id: v.id,
      created_at: v.created_at,
      base_amount: v.base_amount,
      tip_amount: v.tip_amount,
      total_amount_charged: v.total_amount_charged,
      service: v.service,
      paymentMethod: v.paymentMethod,
      branchName: v.branchName,
      locationLabel: v.locationLabel,
    };
  }

  const voucherById = (id: string) => vouchers.find((v) => v.id === id);

  // ---------- mutaciones ----------

  function buildDish(item: BulkDishItem, guestName: string): DemoDish {
    return {
      id: nextId("dish"),
      item: item.item,
      quantity: item.quantity,
      unitPrice: item.price,
      extraPrice: item.extraPrice ?? 0,
      status: "preparing",
      images: item.images ?? [],
      guestName,
      customFields: (item.customFields ?? []).map((f) => ({
        fieldId: f.fieldId,
        fieldName: f.fieldName,
        fieldType: f.fieldType,
        selectedOptions: f.selectedOptions,
      })),
      specialInstructions: item.specialInstructions ?? null,
      paymentStatus: "not_paid",
      menuItemId: item.menuItemId ?? null,
    };
  }

  function emitKitchen(o: DemoOrder, newDishes: DemoDish[], guestName: string) {
    const job: PrintJobData = {
      branchId: DEMO_BRANCH_ID,
      jobId: nextId("job"),
      items: newDishes.map((d) => ({
        name: d.item,
        quantity: d.quantity,
        clasificacion: classificationOf(d.menuItemId),
        custom_fields: printCustomFields(d),
        special_instructions: d.specialInstructions,
      })),
      orderInfo: {
        identifier: `Mesa ${o.table}`,
        folio: o.folio,
        orderedBy: guestName,
      },
    };
    emit("kitchen:print_job", job);
    emit("kitchen:notify", {
      orderType: o.orderType,
      folio: o.folio,
      orderedBy: guestName,
      identifier: `Mesa ${o.table}`,
      branchNumber: DEMO_BRANCH.branch_number,
    });
  }

  /** Abre la mesa si estaba libre o agrega a la cuenta existente. */
  function addDishes(table: string, items: BulkDishItem[], guestName: string) {
    if (items.length === 0) throw new DemoError(400, "La comanda no tiene platillos");
    const t = tables.find((x) => x.number === table);
    if (!t) throw new DemoError(404, `La mesa ${table} no existe`);
    if (t.maintenance) throw new DemoError(409, `La mesa ${table} esta fuera de servicio`);
    let o = openOrderFor(table);
    if (o && o.orderType !== "flex_bill") {
      throw new DemoError(409, "La mesa ya tiene una cuenta de otro servicio");
    }
    if (!o) {
      o = {
        id: nextId("order"),
        orderType: "flex_bill",
        table,
        folio: nextFolio(),
        waiterName: null,
        waiterId: null,
        createdAt: iso(),
        closedAt: null,
        dishes: [],
        payments: [],
        paidAmount: 0,
        movements: [],
      };
      orders.push(o);
      addMovement(o, "table_opened", { guest_name: guestName });
    }
    const added = items.map((i) => buildDish(i, guestName));
    for (const d of added) {
      o.dishes.push(d);
      addMovement(o, "dish_added", {
        guest_name: guestName,
        item: d.item,
        quantity: d.quantity,
        price: round2(d.unitPrice + d.extraPrice),
        display_total: lineTotal(d),
      });
    }
    emitKitchen(o, added, guestName);
    return { table_order_id: o.id };
  }

  function setDishStatus(
    dishId: string,
    status: DishStatus,
    waiter?: { name?: string | null },
  ) {
    const { order, dish } = dishLocation(dishId);
    const before = dish.status;
    dish.status = status;
    addMovement(order, "dish_status_changed", {
      item: dish.item,
      guest_name: dish.guestName,
      status_before: before,
      status_after: status,
      changed_by_waiter_name: waiter?.name ?? null,
    });
    closeIfPaid(order);
    return order;
  }

  function setDishQuantity(
    dishId: string,
    quantity: number,
    waiter?: { name?: string | null },
  ) {
    const { order, dish } = dishLocation(dishId);
    if (dish.paymentStatus === "paid") {
      throw new DemoError(409, "No se puede modificar un platillo ya pagado");
    }
    const before = dish.quantity;
    if (quantity > before) throw new DemoError(400, "Solo se puede reducir la cantidad");
    const full = quantity <= 0;
    if (full) {
      order.dishes = order.dishes.filter((d) => d.id !== dish.id);
    } else {
      dish.quantity = quantity;
    }
    addMovement(order, "dish_removed", {
      item: dish.item,
      guest_name: dish.guestName,
      removed_by_waiter_name: waiter?.name ?? null,
      full_removal: full,
      quantity_before: before,
      quantity_after: full ? 0 : quantity,
    });
    // Sin platillos ni pagos la cuenta deja de existir y la mesa se libera.
    if (order.dishes.length === 0 && order.paidAmount === 0) {
      orders.splice(orders.indexOf(order), 1);
    }
    return { quantity: full ? 0 : quantity, removed: full };
  }

  function setOrderWaiter(orderId: string, name: string, id?: string) {
    const o = mustOrder(orderId);
    addMovement(o, "waiter_changed", {
      from_waiter_name: o.waiterName ?? "EVEN",
      to_waiter_name: name,
    });
    o.waiterName = name === "EVEN" ? null : name;
    o.waiterId = name === "EVEN" ? null : (id ?? null);
    return toOrder(o);
  }

  function applyPayment(o: DemoOrder, amount: number, guestName: string) {
    const applied = Math.min(round2(amount), remainingOf(o));
    if (applied <= 0) throw new DemoError(400, "El monto debe ser mayor a 0 y no exceder el restante");
    o.paidAmount = round2(o.paidAmount + applied);
    addMovement(o, "payment_registered", {
      guest_name: guestName,
      amount: applied,
      display_amount: applied,
      method: lastTx.get(o.id)?.payment_source ?? "manual",
      remaining_after: remainingOf(o),
    });
    closeIfPaid(o);
  }

  /** POST .../tables/:t/pay y .../orders/:id/pay-amount */
  function payAmount(target: { table: string } | { orderId: string }, amount: number, guestName: string) {
    const o = "table" in target ? orderByTable(target.table) : mustOrder(target.orderId);
    applyPayment(o, amount, guestName);
    return tableSummaryOf(o);
  }

  function tableSummaryOf(o: DemoOrder) {
    return { remaining_amount: remainingOf(o), paid_amount: o.paidAmount };
  }

  /** POST /api/dishes/:id/pay y /api/tap-pay/dishes/:id/pay */
  function payDish(dishId: string, guestName: string) {
    const { order, dish } = dishLocation(dishId);
    if (dish.paymentStatus === "paid") throw new DemoError(409, "El platillo ya esta pagado");
    const total = Math.min(lineTotal(dish), remainingOf(order));
    dish.paymentStatus = "paid";
    order.paidAmount = round2(order.paidAmount + total);
    addMovement(order, "payment_registered", {
      guest_name: guestName,
      amount: total,
      display_amount: total,
      method: lastTx.get(order.id)?.payment_source ?? "manual",
      remaining_after: remainingOf(order),
    });
    closeIfPaid(order);
  }

  /** POST /api/payment-transactions: registra pago y comprobante. */
  function recordTransaction(body: ManualTransactionBody) {
    const id = body.id_table_order ?? body.id_tap_pay_order;
    if (!id) throw new DemoError(400, "Falta id_table_order o id_tap_pay_order");
    const o = mustOrder(id);
    lastTx.set(o.id, body);
    const createdAt = iso();
    o.payments.push({
      id: nextId("pay"),
      baseAmount: body.base_amount,
      tipAmount: body.tip_amount,
      totalCharged: body.total_amount_charged,
      cardType: body.payment_source,
      createdAt,
      guestName: body.transaction_by,
    });
    vouchers.push({
      id: nextId("voucher"),
      orderId: o.id,
      created_at: createdAt,
      base_amount: body.base_amount,
      tip_amount: body.tip_amount,
      total_amount_charged: body.total_amount_charged,
      service: serviceLabel(o.orderType),
      paymentMethod:
        body.payment_source === "cash"
          ? "Efectivo"
          : `Terminal${body.manual_card_type ? ` (${body.manual_card_type})` : ""}`,
      branchName: DEMO_BRANCH.name,
      locationLabel: `Mesa ${o.table}`,
    });
  }

  /** POST /api/kitchen/tables/:n/open: trae a Even el ticket abierto en el POS. */
  function openFromPos(table: string) {
    const ticket = posTicketFor(table);
    if (!ticket) throw new DemoError(409, `La mesa ${table} no tiene ticket abierto en el POS`);
    posTickets.splice(posTickets.indexOf(ticket), 1);
    const { table_order_id } = addDishes(table, ticket.items, ticket.guestName);
    return summaryFor(mustOrder(table_order_id));
  }

  function updatePrinter(id: string, updates: Partial<PrinterRecord>) {
    const p = printers.find((x) => x.id === id);
    if (!p) throw new DemoError(404, "Impresora no encontrada");
    Object.assign(p, updates);
    return p;
  }

  function deletePrinter(id: string) {
    printers = printers.filter((p) => p.id !== id);
  }

  // ---------- semilla ----------

  function seedDish(
    menuId: number,
    quantity: number,
    status: DishStatus,
    guest: string,
    extra?: { extraPrice?: number; customFields?: CustomField[]; note?: string },
  ): DemoDish {
    const mi = findMenuItem(menuId);
    if (!mi) throw new Error(`demo: platillo ${menuId} no existe en el menu`);
    return {
      id: nextId("dish"),
      item: mi.name,
      quantity,
      unitPrice: priceAfterDiscount(mi),
      extraPrice: extra?.extraPrice ?? 0,
      status,
      images: [],
      guestName: guest,
      customFields: extra?.customFields ?? [],
      specialInstructions: extra?.note ?? null,
      paymentStatus: "not_paid",
      menuItemId: menuId,
    };
  }

  function seedOrder(spec: {
    type: DemoOrderType;
    table: string;
    minutesAgo: number;
    waiter?: { id: string; name: string };
    guest: string;
    dishes: DemoDish[];
    prepaid?: boolean;
  }): DemoOrder {
    const createdAt = iso(now() - spec.minutesAgo * 60_000);
    const o: DemoOrder = {
      id: nextId("order"),
      orderType: spec.type,
      table: spec.table,
      folio: nextFolio(),
      waiterName: spec.waiter?.name ?? null,
      waiterId: spec.waiter?.id ?? null,
      createdAt,
      closedAt: null,
      dishes: spec.dishes,
      payments: [],
      paidAmount: 0,
      movements: [],
    };
    orders.push(o);
    o.movements.push({
      id: nextId("mv"),
      type: "table_opened",
      actorLabel: null,
      details: { guest_name: spec.guest },
      createdAt,
    });
    for (const d of o.dishes) {
      o.movements.push({
        id: nextId("mv"),
        type: "dish_added",
        actorLabel: null,
        details: {
          guest_name: d.guestName,
          item: d.item,
          quantity: d.quantity,
          price: round2(d.unitPrice + d.extraPrice),
          display_total: lineTotal(d),
        },
        createdAt,
      });
    }
    if (spec.prepaid) {
      const total = totalOf(o);
      o.paidAmount = total;
      for (const d of o.dishes) d.paymentStatus = "paid";
      o.payments.push({
        id: nextId("pay"),
        baseAmount: total,
        tipAmount: 0,
        totalCharged: total,
        cardType: "card",
        createdAt,
        guestName: spec.guest,
      });
      vouchers.push({
        id: nextId("voucher"),
        orderId: o.id,
        created_at: createdAt,
        base_amount: total,
        tip_amount: 0,
        total_amount_charged: total,
        service: serviceLabel(spec.type),
        paymentMethod: "Tarjeta (en línea)",
        branchName: DEMO_BRANCH.name,
        locationLabel: `Mesa ${spec.table}`,
      });
    }
    return o;
  }

  function seedClosed(spec: {
    type: DemoOrderType;
    table: string;
    closedAt: number;
    waiter: { id: string; name: string };
    dishes: [number, number][];
    method: "cash" | "terminal" | "card";
    tipPct: number;
    cardType?: string;
  }) {
    const dishes = spec.dishes.map(([id, q]) => {
      const d = seedDish(id, q, "delivered", "MESERO");
      d.paymentStatus = "paid";
      return d;
    });
    const createdAt = iso(spec.closedAt - 55 * 60_000);
    const o: DemoOrder = {
      id: nextId("order"),
      orderType: spec.type,
      table: spec.table,
      folio: nextFolio(),
      waiterName: spec.waiter.name,
      waiterId: spec.waiter.id,
      createdAt,
      closedAt: iso(spec.closedAt),
      dishes,
      payments: [],
      paidAmount: 0,
      movements: [],
    };
    const total = totalOf(o);
    const tip = round2((total * spec.tipPct) / 100);
    o.paidAmount = total;
    o.payments.push({
      id: nextId("pay"),
      baseAmount: total,
      tipAmount: tip,
      totalCharged: round2(total + tip),
      cardType: spec.method,
      createdAt: iso(spec.closedAt),
      guestName: `MESERO - ${spec.waiter.name}`,
    });
    o.movements.push(
      { id: nextId("mv"), type: "table_opened", actorLabel: null, details: { guest_name: "MESERO" }, createdAt },
      {
        id: nextId("mv"),
        type: "payment_registered",
        actorLabel: null,
        details: {
          guest_name: `MESERO - ${spec.waiter.name}`,
          amount: total,
          display_amount: total,
          method: spec.method,
          remaining_after: 0,
        },
        createdAt: iso(spec.closedAt),
      },
      { id: nextId("mv"), type: "table_closed", actorLabel: null, details: {}, createdAt: iso(spec.closedAt) },
    );
    orders.push(o);
    vouchers.push({
      id: nextId("voucher"),
      orderId: o.id,
      created_at: iso(spec.closedAt),
      base_amount: total,
      tip_amount: tip,
      total_amount_charged: round2(total + tip),
      service: serviceLabel(spec.type),
      paymentMethod:
        spec.method === "cash" ? "Efectivo" : spec.method === "terminal" ? "Terminal (credito)" : "Tarjeta (en línea)",
      branchName: DEMO_BRANCH.name,
      locationLabel: `Mesa ${spec.table}`,
    });
  }

  function seed() {
    const [luis, marisol, carlos] = DEMO_WAITERS;
    const sel = (fieldId: string, fieldName: string, fieldType: string, opts: [string, string, number][]): CustomField => ({
      fieldId,
      fieldName,
      fieldType,
      selectedOptions: opts.map(([optionId, optionName, price]) => ({ optionId, optionName, price, quantity: 1 })),
    });

    // Mesa 2: en curso, mezcla de estados.
    seedOrder({
      type: "flex_bill",
      table: "2",
      minutesAgo: 35,
      waiter: luis,
      guest: "MESERO - Luis Hernández",
      dishes: [
        seedDish(101, 2, "delivered", "MESERO - Luis Hernández"),
        seedDish(201, 1, "preparing", "MESERO - Luis Hernández", {
          extraPrice: 15,
          customFields: [
            sel("cf-zarandeado-guarnicion", "Guarnición", "dropdown", [["opt-arroz", "Arroz", 0]]),
            sel("cf-zarandeado-extras", "Extras", "checkboxes", [["opt-salsa", "Salsa macha", 15]]),
          ],
          note: "Sin cebolla",
        }),
        seedDish(403, 2, "ready", "MESERO - Luis Hernández", {
          customFields: [sel("cf-cerveza-marca", "Marca", "dropdown", [["opt-pacifico", "Pacífico", 0]])],
        }),
      ],
    });

    // Mesa 3: todo entregado y con un pago parcial (por cobrar).
    const o3 = seedOrder({
      type: "flex_bill",
      table: "3",
      minutesAgo: 70,
      waiter: marisol,
      guest: "MESERO - Marisol Pérez",
      dishes: [
        seedDish(102, 1, "delivered", "MESERO - Marisol Pérez", {
          customFields: [sel("cf-aguachile-picor", "Nivel de picor", "dropdown", [["opt-medio", "Medio", 0]])],
        }),
        seedDish(202, 2, "delivered", "MESERO - Marisol Pérez"),
        seedDish(402, 2, "delivered", "MESERO - Marisol Pérez"),
      ],
    });
    o3.paidAmount = 300;
    o3.payments.push({
      id: nextId("pay"),
      baseAmount: 300,
      tipAmount: 30,
      totalCharged: 330,
      cardType: "cash",
      createdAt: iso(now() - 12 * 60_000),
      guestName: "MESERO - Marisol Pérez",
    });
    vouchers.push({
      id: nextId("voucher"),
      orderId: o3.id,
      created_at: iso(now() - 12 * 60_000),
      base_amount: 300,
      tip_amount: 30,
      total_amount_charged: 330,
      service: "Flex Bill",
      paymentMethod: "Efectivo",
      branchName: DEMO_BRANCH.name,
      locationLabel: "Mesa 3",
    });
    addMovement(o3, "payment_registered", {
      guest_name: "MESERO - Marisol Pérez",
      amount: 300,
      display_amount: 300,
      method: "cash",
      remaining_after: remainingOf(o3),
    });

    // Mesa 4: Tap Order & Pay (prepagada), en cocina.
    seedOrder({
      type: "tap",
      table: "4",
      minutesAgo: 20,
      guest: "Ana G.",
      prepaid: true,
      dishes: [
        seedDish(301, 3, "preparing", "Ana G."),
        seedDish(404, 2, "ready", "Ana G."),
      ],
    });

    // Mesa 6: recien servida, sin mesero asignado.
    seedOrder({
      type: "flex_bill",
      table: "6",
      minutesAgo: 15,
      guest: "MESERO",
      dishes: [
        seedDish(103, 1, "ready", "MESERO"),
        seedDish(204, 1, "preparing", "MESERO"),
        seedDish(401, 2, "delivered", "MESERO"),
      ],
    });

    // Mesa 7: todo entregado, sin pagos (por cobrar).
    seedOrder({
      type: "flex_bill",
      table: "7",
      minutesAgo: 90,
      waiter: carlos,
      guest: "MESERO - Carlos Ruiz",
      dishes: [
        seedDish(302, 4, "delivered", "MESERO - Carlos Ruiz"),
        seedDish(403, 4, "delivered", "MESERO - Carlos Ruiz", {
          customFields: [sel("cf-cerveza-marca", "Marca", "dropdown", [["opt-modelo", "Modelo Especial", 0]])],
        }),
        seedDish(303, 2, "delivered", "MESERO - Carlos Ruiz"),
      ],
    });

    // Mesa 9: Tap Order & Pay con platillos listos por entregar.
    seedOrder({
      type: "tap",
      table: "9",
      minutesAgo: 25,
      guest: "Roberto M.",
      prepaid: true,
      dishes: [
        seedDish(203, 1, "ready", "Roberto M."),
        seedDish(402, 1, "delivered", "Roberto M."),
      ],
    });

    // Mesa 12: recien abierta.
    seedOrder({
      type: "flex_bill",
      table: "12",
      minutesAgo: 2,
      guest: "MESERO",
      dishes: [seedDish(101, 1, "preparing", "MESERO")],
    });

    // Mesa 11: ticket abierto directo en el POS (se puede traer a Even).
    posTickets.push({
      table: DEMO_POS_TABLE,
      guestName: "POS",
      items: [
        { item: "Coctel de camarón", quantity: 1, price: 153, menuItemId: 103 },
        { item: "Cerveza", quantity: 2, price: 55, menuItemId: 403 },
      ],
    });

    // Historial: hoy y dias anteriores.
    const d = new Date(now());
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayAt = (h: number, m: number, i: number) =>
      Math.max(startOfDay + (i + 1) * 60_000, Math.min(startOfDay + h * 3_600_000 + m * 60_000, now() - 5 * 60_000));
    const daysAgo = (n: number, h: number) => startOfDay - n * 86_400_000 + h * 3_600_000;
    seedClosed({ type: "flex_bill", table: "1", closedAt: todayAt(13, 5, 0), waiter: luis, dishes: [[101, 2], [201, 2], [401, 4]], method: "terminal", tipPct: 15 });
    seedClosed({ type: "flex_bill", table: "5", closedAt: todayAt(13, 40, 1), waiter: marisol, dishes: [[301, 4], [302, 4], [403, 4]], method: "cash", tipPct: 10 });
    seedClosed({ type: "tap", table: "8", closedAt: todayAt(14, 10, 2), waiter: carlos, dishes: [[202, 2], [402, 2]], method: "card", tipPct: 10 });
    seedClosed({ type: "flex_bill", table: "2", closedAt: todayAt(14, 30, 3), waiter: luis, dishes: [[103, 2], [204, 2], [404, 2]], method: "terminal", tipPct: 20 });
    seedClosed({ type: "flex_bill", table: "6", closedAt: todayAt(15, 15, 4), waiter: carlos, dishes: [[102, 3], [201, 1], [403, 3]], method: "cash", tipPct: 0 });
    seedClosed({ type: "tap", table: "4", closedAt: daysAgo(1, 14), waiter: marisol, dishes: [[203, 2], [401, 2]], method: "card", tipPct: 10 });
    seedClosed({ type: "flex_bill", table: "3", closedAt: daysAgo(2, 20), waiter: luis, dishes: [[201, 3], [101, 3], [403, 6]], method: "terminal", tipPct: 15 });
    seedClosed({ type: "flex_bill", table: "7", closedAt: daysAgo(5, 15), waiter: carlos, dishes: [[302, 6], [303, 2]], method: "cash", tipPct: 10 });
    seedClosed({ type: "flex_bill", table: "9", closedAt: daysAgo(12, 19), waiter: marisol, dishes: [[202, 2], [204, 2], [404, 4]], method: "terminal", tipPct: 12 });
    seedClosed({ type: "flex_bill", table: "1", closedAt: daysAgo(24, 21), waiter: luis, dishes: [[201, 2], [101, 1]], method: "cash", tipPct: 10 });
  }

  if (options.seed !== false) seed();

  return {
    subscribe,
    emit,
    branch: DEMO_BRANCH,
    waiters: () => DEMO_WAITERS.map(({ id, name }) => ({ id, name })),
    verifyWaiter: (id: string, password: string) =>
      DEMO_WAITERS.some((w) => w.id === id && w.password === password),
    menu: () => DEMO_MENU,
    printers: () => printers,
    updatePrinter,
    deletePrinter,
    activeOrders,
    historyOrders,
    availableMonths,
    listTables,
    reorderTables,
    qrCodes,
    posPeekBatch,
    posTicketFor,
    openFromPos,
    summaryForTable: (table: string) => summaryFor(orderByTable(table)),
    tableSummary,
    tableDishOrders,
    movementsFor,
    listVouchers,
    voucherById,
    addDishes,
    setDishStatus,
    setDishQuantity,
    setOrderWaiter,
    payAmount,
    payDish,
    recordTransaction,
    /** Reimpresion: arma el job de una orden existente. */
    reprintJob: (orderId: string): PrintJobData => {
      const o = mustOrder(orderId);
      return {
        branchId: DEMO_BRANCH_ID,
        reprint: true,
        items: o.dishes.map((d) => ({
          name: d.item,
          quantity: d.quantity,
          clasificacion: classificationOf(d.menuItemId),
          custom_fields: printCustomFields(d),
          special_instructions: d.specialInstructions,
        })),
        orderInfo: { identifier: `Mesa ${o.table}`, folio: o.folio },
      };
    },
  };
}

export type DemoStore = ReturnType<typeof createDemoStore>;

let singleton: DemoStore | null = null;
export function getDemoStore(): DemoStore {
  singleton ??= createDemoStore();
  return singleton;
}

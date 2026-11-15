import type { SpatialGridConfig, SpatialUnit } from "../components/SpatialGrid";
import {
  getTablesForBranch,
  getRoomsForBranch,
  reorderTables,
  reorderRooms,
  type Branch,
  type ReorderUnit,
} from "./api";
import type { Order, DishStatus, CookingStatus } from "../types";

// Props comunes que App.tsx tiene disponibles y que cada HomeScreen necesita,
// mapeadas internamente a los nombres de prop que espera Kitchen o SpatialGrid.
export interface HomeScreenProps {
  onOpenPrinters: () => void;
  onOpenHistorial: () => void;
  onOpenComprobantes: () => void;
  branchId: string | null;
  branches: Branch[];
  branchesLoading: boolean;
  onBranchChange: (id: string) => void;
  orders: Order[];
  ordersLoading: boolean;
  ordersError: string | null;
  fetchOrders: (showSpinner?: boolean) => Promise<unknown>;
  updateDish: (
    orderId: string,
    orderType: string,
    dishId: string,
    status: DishStatus,
    waiterName?: string | null,
    waiterId?: string | null,
  ) => Promise<void>;
  updateDishQuantity: (
    orderId: string,
    dishId: string,
    quantity: number,
    waiterName?: string | null,
    waiterId?: string | null,
  ) => Promise<void>;
  updateOrderCookingStatus: (
    orderId: string,
    status: CookingStatus,
  ) => Promise<void>;
  updatePrepTimeExtraMinutes: (
    orderId: string,
    extraMinutes: number,
  ) => Promise<void>;
  availableWaiters: { id: string; name: string }[];
  waiterSession: { id: string; name: string } | null;
  requireWaiterLogin: (
    onSuccess: (waiter: { id: string; name: string }) => void,
    options?: { forcePicker?: boolean },
  ) => void;
}

async function fetchTableUnits(
  branchId: string,
  token: string,
): Promise<SpatialUnit[]> {
  const tables = await getTablesForBranch(branchId, token);
  return tables.map((t) => ({
    id: t.id,
    number: t.table_number,
    status: t.status,
    has_open_account: t.has_open_account,
    has_tap_pay_account: t.has_tap_pay_account,
  }));
}

async function fetchRoomUnits(
  branchId: string,
  token: string,
): Promise<SpatialUnit[]> {
  const rooms = await getRoomsForBranch(branchId, token);
  return rooms.map((r) => ({
    id: r.id,
    number: r.room_number,
    status: r.status,
    has_open_account: r.has_open_account,
  }));
}

function reorderTableUnits(
  branchId: string,
  order: ReorderUnit[],
  token: string,
): Promise<void> {
  return reorderTables(branchId, order, token);
}

function reorderRoomUnits(
  branchId: string,
  order: ReorderUnit[],
  token: string,
): Promise<void> {
  return reorderRooms(branchId, order, token);
}

export const tapPayConfig: SpatialGridConfig = {
  orderType: "tap_pay",
  unitLabel: "Mesa",
  pluralLabel: "Mesas",
  fetchUnits: fetchTableUnits,
  reorderUnits: reorderTableUnits,
  freeUnitClickable: true,
  pulseKind: "pos_pending",
};

export const tapOrderConfig: SpatialGridConfig = {
  orderType: "tap",
  unitLabel: "Mesa",
  pluralLabel: "Mesas",
  fetchUnits: fetchTableUnits,
  reorderUnits: reorderTableUnits,
  freeUnitClickable: false,
  pulseKind: "preparing",
};

export const flexBillConfig: SpatialGridConfig = {
  orderType: "flex_bill",
  unitLabel: "Mesa",
  pluralLabel: "Mesas",
  fetchUnits: fetchTableUnits,
  reorderUnits: reorderTableUnits,
  freeUnitClickable: true,
  pulseKind: "preparing",
};

export const roomServiceConfig: SpatialGridConfig = {
  orderType: "room",
  unitLabel: "Habitación",
  pluralLabel: "Habitaciones",
  fetchUnits: fetchRoomUnits,
  reorderUnits: reorderRoomUnits,
  freeUnitClickable: false,
  pulseKind: "preparing",
};

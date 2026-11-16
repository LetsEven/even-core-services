import type { Branch } from "./api";
import type { Order, DishStatus, CookingStatus } from "../types";

// Props comunes que App.tsx tiene disponibles y que cada HomeScreen necesita,
// mapeadas internamente a los nombres de prop que espera Kitchen.
export interface HomeScreenProps {
  branchId: string | null;
  branches: Branch[];
  branchesLoading: boolean;
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

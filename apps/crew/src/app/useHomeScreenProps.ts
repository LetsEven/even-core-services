import type { HomeScreenProps } from "../services/homeScreenShared";
import { useSession } from "./session/context";

// Arma las props de las pantallas principales (Kitchen/SpatialGrid) desde la sesión.
export function useHomeScreenProps(): HomeScreenProps {
  const s = useSession();
  return {
    branchId: s.branchId,
    branches: s.branches,
    branchesLoading: s.branchesLoading,
    orders: s.orders,
    ordersLoading: s.ordersLoading,
    ordersError: s.ordersError,
    fetchOrders: s.fetchOrders,
    updateDish: s.updateDish,
    updateDishQuantity: s.updateDishQuantity,
    updateOrderCookingStatus: s.updateOrderCookingStatus,
    updatePrepTimeExtraMinutes: s.updatePrepTimeExtraMinutes,
    availableWaiters: s.availableWaiters,
    waiterSession: s.waiterSession,
    requireWaiterLogin: s.requireWaiterLogin,
  };
}

import { createContext, useContext } from "react";
import type { CrewDevice } from "../../hooks/useSocket";
import type { Branch } from "../../services/api";
import type { OrderType } from "../../types";
import type { CrewConfig } from "../../features/config/crewConfig";
import type { HomeScreenProps } from "../../services/homeScreenShared";

type Waiter = { id: string; name: string };

export interface SessionValue {
  deviceId: string;
  // Sucursal
  branchId: string | null;
  branches: Branch[];
  branchesLoading: boolean;
  currentBranch: Branch | undefined;
  changeBranch: (id: string) => void;
  // Servicios contratados
  activeOrderTypes: OrderType[];
  crewConfig: CrewConfig;
  // Mesero
  availableWaiters: Waiter[];
  waiterSession: Waiter | null;
  requireWaiterLogin: HomeScreenProps["requireWaiterLogin"];
  // Órdenes (compartidas por Cocina y Mesas)
  orders: HomeScreenProps["orders"];
  ordersLoading: boolean;
  ordersError: string | null;
  fetchOrders: HomeScreenProps["fetchOrders"];
  updateDish: HomeScreenProps["updateDish"];
  updateDishQuantity: HomeScreenProps["updateDishQuantity"];
  updateOrderCookingStatus: HomeScreenProps["updateOrderCookingStatus"];
  updatePrepTimeExtraMinutes: HomeScreenProps["updatePrepTimeExtraMinutes"];
  // Dispositivos / impresión
  connectedDevices: CrewDevice[];
  masterDeviceId: string | null;
  setMaster: (deviceId: string) => void;
  refreshPrinters: () => void;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de SessionProvider");
  return ctx;
}

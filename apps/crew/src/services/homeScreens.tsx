import Kitchen from "../pages/Kitchen";
import SpatialGrid from "../components/SpatialGrid";
import type { HomeScreenProps } from "./homeScreenShared";
import {
  tapPayConfig,
  tapOrderConfig,
  flexBillConfig,
  roomServiceConfig,
} from "./homeScreenShared";

// Solo componentes en este archivo (Fast Refresh) — el objeto
// SERVICE_REGISTRY y la config de cada SpatialGrid viven en registry.ts /
// homeScreenShared.ts.

export function PickAndGoHome(props: HomeScreenProps) {
  return (
    <Kitchen
      onOpenPrinters={props.onOpenPrinters}
      onOpenHistorial={props.onOpenHistorial}
      orders={props.orders.filter((o) => o.orderType === "pick_and_go")}
      loading={props.ordersLoading}
      error={props.ordersError}
      fetchOrders={props.fetchOrders}
      updateDish={props.updateDish}
      updateOrderCookingStatus={props.updateOrderCookingStatus}
      updatePrepTimeExtraMinutes={props.updatePrepTimeExtraMinutes}
      branches={props.branches}
      branchesLoading={props.branchesLoading}
      branchId={props.branchId}
      onBranchChange={props.onBranchChange}
      availableWaiters={props.availableWaiters}
      waiterSession={props.waiterSession}
      requireWaiterLogin={props.requireWaiterLogin}
    />
  );
}

function SpatialHome(props: HomeScreenProps & { config: typeof tapPayConfig }) {
  return (
    <SpatialGrid
      config={props.config}
      onOpenPrinters={props.onOpenPrinters}
      onOpenHistorial={props.onOpenHistorial}
      branchId={props.branchId}
      branches={props.branches}
      branchesLoading={props.branchesLoading}
      onBranchChange={props.onBranchChange}
      orders={props.orders}
      onDishStatusChange={props.updateDish}
      onOrderCookingStatusChange={props.updateOrderCookingStatus}
      onPrepTimeExtraChange={props.updatePrepTimeExtraMinutes}
      onDishQuantityChange={props.updateDishQuantity}
      onOrdersRefresh={() => props.fetchOrders()}
      availableWaiters={props.availableWaiters}
      waiterSession={props.waiterSession}
      requireWaiterLogin={props.requireWaiterLogin}
    />
  );
}

export function TapPayHome(props: HomeScreenProps) {
  return <SpatialHome {...props} config={tapPayConfig} />;
}

export function TapOrderHome(props: HomeScreenProps) {
  return <SpatialHome {...props} config={tapOrderConfig} />;
}

export function FlexBillHome(props: HomeScreenProps) {
  return <SpatialHome {...props} config={flexBillConfig} />;
}

export function RoomServiceHome(props: HomeScreenProps) {
  return <SpatialHome {...props} config={roomServiceConfig} />;
}

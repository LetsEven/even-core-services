import Kitchen from "../pages/Kitchen";
import type { HomeScreenProps } from "./homeScreenShared";

export function PickAndGoHome(props: HomeScreenProps) {
  return (
    <Kitchen
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
      availableWaiters={props.availableWaiters}
      waiterSession={props.waiterSession}
      requireWaiterLogin={props.requireWaiterLogin}
    />
  );
}

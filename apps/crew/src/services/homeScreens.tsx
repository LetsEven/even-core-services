import Kitchen from "../pages/Kitchen";
import type { HomeScreenProps } from "./homeScreenShared";

export function PickAndGoHome(props: HomeScreenProps & { readOnly?: boolean }) {
  return (
    <Kitchen
      readOnly={props.readOnly}
      orders={props.orders}
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

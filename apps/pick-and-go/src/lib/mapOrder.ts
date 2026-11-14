import type {
  ActiveOrderResponse,
  PickAndGoOrder,
} from "../services/pickandgo.service";

/** Convierte la respuesta de getOrder() al shape del detalle de pedido activo. */
export const mapOrderToActiveOrderData = (
  order: PickAndGoOrder,
): NonNullable<ActiveOrderResponse["data"]> => ({
  pick_and_go_order: {
    id: order.id,
    folio: order.folio ?? null,
    clerk_user_id: order.clerk_user_id ?? null,
    customer_name: order.customer_name,
    total_amount: order.total_amount,
    payment_status: order.payment_status,
    order_status: order.order_status,
    cooking_status: order.cooking_status,
    restaurant_id: order.restaurant_id,
    branch_number: order.branch_number,
    created_at: order.created_at,
    prep_time_minutes: order.prep_metadata?.prep_time_minutes ?? 15,
  },
  dishes: (order.items || []).map((item) => ({
    id: item.id,
    item: item.item,
    quantity: item.quantity,
    price: item.price,
    status: item.status,
    payment_status: item.payment_status,
    images: item.images,
  })),
  pending_dishes_count: (order.items || []).filter(
    (item) => item.status !== "delivered",
  ).length,
});

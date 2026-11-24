// Orden de Retail tal como la devuelve GET /retail/... (dish_order + retail_orders).

export interface DishOrder {
  id: string;
  item: string;
  quantity: number;
  price: number;
  extra_price: number | null;
  images: string[];
  custom_fields: unknown;
  special_instructions?: string | null;
}

export interface RetailOrder {
  id: string;
  restaurant_id: number;
  branch_number: number;
  branch_id: string;
  total_amount: number;
  status: "pending" | "paid" | "cancelled";
  folio: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  items: DishOrder[];
  // Alguien más la está pagando en este momento
  en_cobro: boolean;
}

export function dishTotal(d: DishOrder): number {
  return (Number(d.price) + Number(d.extra_price || 0)) * (Number(d.quantity) || 1);
}

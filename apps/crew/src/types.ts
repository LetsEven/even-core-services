export type DishStatus = "preparing" | "ready" | "delivered";

export type CookingStatus = "preparing" | "ready" | "delivered";

export type OrderType =
  | "tap"
  | "pick_and_go"
  | "room"
  | "tap_pay"
  | "flex_bill";

export interface CustomFieldOption {
  optionId: string;
  optionName: string;
  price: number;
  quantity: number;
}

export interface CustomField {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  selectedOptions?: CustomFieldOption[];
}

export interface Dish {
  id: string;
  item: string;
  quantity: number;
  status: DishStatus;
  images: string[];
  orderedBy?: string | null;
  userFolio?: string | null;
  customFields?: CustomField[] | null;
  specialInstructions?: string | null;
  price?: number;
  paymentStatus?: string;
}

export interface PaymentTransaction {
  id: string;
  baseAmount: number;
  tipAmount: number;
  totalCharged: number;
  cardType: string;
  createdAt: string;
  guestName?: string | null;
}

export type ManualPaymentMethod = "cash" | "terminal";

export type MovementType =
  | "table_opened"
  | "dish_added"
  | "dish_removed"
  | "dish_status_changed"
  | "waiter_changed"
  | "payment_registered"
  | "table_closed";

export interface Movement {
  id: string;
  type: MovementType;
  actorLabel?: string | null;
  details: Record<string, any>;
  createdAt: string;
}
export type ManualCardType = "credito" | "debito" | "amex";
export type ManualPaymentType = "full-bill" | "select-items" | "choose-amount";

export interface TableSummary {
  table_number: string;
  table_order_id: string;
  restaurant_id: number;
  branch_number: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: "not_paid" | "partial" | "paid";
}

export interface DishOrderCrew {
  dish_order_id: string;
  item: string;
  quantity: number;
  price: number;
  total_price: number;
  // Precio con la comisión de Flex Bill ya incrustada (ver
  // commissionCalculator.js en el backend) — lo que se le cobra al
  // cliente, nunca price/total_price directo.
  display_price?: number;
  total_display_price?: number;
  payment_status: "not_paid" | "paid";
  guest_name: string;
}

export interface Order {
  id: string;
  orderType: OrderType;
  identifier: string;
  customerName?: string | null;
  customerPhone?: string | null;
  createdAt: string;
  folio?: string | number | null;
  orderNotes?: string | null;
  status?: string | null;
  totalAmount?: number | null;
  paidAmount?: number | null;
  remainingAmount?: number | null;
  // Exclusivo de orderType "flex_bill" — mismos montos pero con la
  // comisión de Flex Bill ya incrustada (ver commissionCalculator.js en
  // even-backend). null/undefined en el resto de los servicios.
  totalDisplayAmount?: number | null;
  paidDisplayAmount?: number | null;
  remainingDisplayAmount?: number | null;
  payments?: PaymentTransaction[];
  dishes: Dish[];
  cookingStatus?: CookingStatus;
  prepTimeMinutes?: number | null;
  waiterExtraMinutes?: number | null;
  waiterName?: string | null;
  waiterId?: string | null;
}

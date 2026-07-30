import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Order, DishStatus, CookingStatus } from "../types";
import type { Branch } from "../services/api";
import OrderCard from "./OrderCard";

interface OrderCarouselProps {
  orders: Order[];
  onDishStatusChange: (
    orderId: string,
    orderType: string,
    dishId: string,
    status: DishStatus,
  ) => void;
  onOrderCookingStatusChange: (orderId: string, status: CookingStatus) => void;
  onPrepTimeExtraChange?: (orderId: string, extraMinutes: number) => void;
  currentBranch?: Branch | null;
  onOrdersRefresh?: () => void;
  availableWaiters?: { id: string; name: string }[];
}

export default function OrderCarousel({
  orders,
  onDishStatusChange,
  onOrderCookingStatusChange,
  onPrepTimeExtraChange,
  currentBranch,
  onOrdersRefresh,
  availableWaiters = [{ id: "EVEN", name: "EVEN" }],
}: OrderCarouselProps) {
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, orders.length - 1));

  if (orders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="text-5xl">✅</div>
        <p className="text-lg font-medium text-even-evergreen uppercase tracking-wider">
          Sin órdenes pendientes
        </p>
        <p className="text-xs text-even-evergreen/60 uppercase tracking-widest">
          Todas las órdenes han sido entregadas
        </p>
      </div>
    );
  }

  const order = orders[safeIndex];
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(orders.length - 1, i + 1));

  return (
    <div className="flex flex-col gap-4">
      {/* Navegación */}
      <div className="flex items-center justify-between">
        <button
          onClick={prev}
          disabled={safeIndex === 0}
          className="p-2 rounded-md bg-even-evergreen/10 disabled:opacity-20 active:scale-95 transition-all cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 text-even-evergreen" />
        </button>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-even-evergreen/70">
            {safeIndex + 1} / {orders.length}
          </span>
          <div className="flex gap-1.5">
            {orders.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  i === safeIndex
                    ? "bg-even-grass w-5"
                    : "bg-even-evergreen/30 w-2"
                }`}
              />
            ))}
          </div>
        </div>

        <button
          onClick={next}
          disabled={safeIndex === orders.length - 1}
          className="p-2 rounded-md bg-even-evergreen/10 disabled:opacity-20 active:scale-95 transition-all cursor-pointer"
        >
          <ChevronRight className="w-5 h-5 text-even-evergreen" />
        </button>
      </div>

      {/* Orden actual */}
      <OrderCard
        order={order}
        onDishStatusChange={(dishId, status) =>
          onDishStatusChange(order.id, order.orderType, dishId, status)
        }
        onOrderCookingStatusChange={onOrderCookingStatusChange}
        onPrepTimeExtraChange={onPrepTimeExtraChange}
        currentBranch={currentBranch}
        onPaymentRegistered={onOrdersRefresh}
        availableWaiters={availableWaiters}
      />
    </div>
  );
}

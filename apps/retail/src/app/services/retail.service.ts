import { requestWithAuth } from "./request-helper";
import type { RetailOrder } from "@/app/types/order";

export const retailService = {
  // La orden pendiente de la sucursal, o null si no hay
  async getActiveOrder(
    restaurantId: string | number,
    branchNumber: string | number,
  ): Promise<RetailOrder | null> {
    const res = await requestWithAuth<RetailOrder | null>(
      `/retail/restaurants/${restaurantId}/branches/${branchNumber}/active-order`,
    );
    if (!res.success) throw new Error(res.error?.message || "No se pudo cargar la orden");
    return res.data ?? null;
  },

  async getOrder(orderId: string): Promise<RetailOrder> {
    const res = await requestWithAuth<RetailOrder>(`/retail/orders/${orderId}`);
    if (!res.success || !res.data) {
      throw new Error(res.error?.message || "Orden no encontrada");
    }
    return res.data;
  },
};

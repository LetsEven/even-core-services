import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import type { Order } from "../../types";
import {
  getQRCodesForBranch,
  updateOrderWaiter,
  type QRCodeRow,
} from "../../services/api";
import { parseLocationCode } from "../../utils/identifier";
import type { Waiter } from "./logic";

// Mesero asignado con actualización optimista (igual que OrderCard): se
// muestra al instante y se revierte si el PATCH falla.
export function useWaiterAssignment(
  order: Order,
  requireWaiterLogin: (
    onSuccess: (waiter: Waiter) => void,
    options?: { forcePicker?: boolean },
  ) => void,
) {
  const { getToken } = useAuth();
  const [name, setName] = useState(order.waiterName ?? "EVEN");
  const [id, setId] = useState(order.waiterId);

  useEffect(() => {
    setName(order.waiterName ?? "EVEN");
    setId(order.waiterId);
  }, [order.waiterName, order.waiterId]);

  const persist = useCallback(
    async (n: string, wid: string | undefined) => {
      setName(n);
      setId(wid);
      try {
        const token = await getToken();
        if (!token) return;
        await updateOrderWaiter(order.id, order.orderType, n, wid, token);
      } catch {
        setName(order.waiterName ?? "EVEN");
        setId(order.waiterId);
      }
    },
    [getToken, order.id, order.orderType, order.waiterName, order.waiterId],
  );

  const claim = useCallback(() => {
    // Siempre la lista: el dispositivo puede estar compartido.
    requireWaiterLogin((w) => void persist(w.name, w.id), { forcePicker: true });
  }, [requireWaiterLogin, persist]);

  const release = useCallback(() => void persist("EVEN", undefined), [persist]);

  return { waiterName: name, waiterId: id, claim, release };
}

// Carga el QR de la mesa para el ticket y abre el modal.
export function useTicket(order: Order, branchId: string | undefined) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<QRCodeRow | null>(null);

  const openTicket = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    const code = parseLocationCode(order.identifier);
    try {
      const token = await getToken();
      const codes = token ? await getQRCodesForBranch(branchId, token) : [];
      setQr(codes.find((q) => q.table_number === code) ?? null);
    } catch {
      setQr(null);
    }
    setLoading(false);
    setOpen(true);
  }, [branchId, getToken, order.identifier]);

  return { loading, open, qr, openTicket, close: () => setOpen(false) };
}

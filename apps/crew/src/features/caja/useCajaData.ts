import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  getAvailableMonths,
  getOrderHistory,
  getVouchers,
  type Voucher,
} from "../../services/api";
import type { Order } from "../../types";
import { getDateRange, type CajaFilter } from "./dateRange";
import { filterOrders, summarizeOrders } from "./summary";

const MAX_VOUCHER_PAGES = 10;

interface Params {
  branchId: string | null;
  restaurantId: number | null;
}

// Estado compartido de Caja: periodo y búsqueda comunes a Órdenes y Comprobantes.
export function useCajaData({ branchId, restaurantId }: Params) {
  const { getToken } = useAuth();
  const [filter, setFilter] = useState<CajaFilter>("today");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [vouchersError, setVouchersError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const m = await getAvailableMonths(token, branchId);
        if (!cancelled) setMonths(m);
      } catch {
        if (!cancelled) setMonths([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, branchId]);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const token = await getToken().catch(() => null);
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { since, until } = getDateRange(filter);

      const loadOrders = async () => {
        try {
          const data = await getOrderHistory(token, branchId, since, until);
          if (cancelled) return;
          setOrders(data);
          setOrdersError(null);
        } catch (e) {
          if (!cancelled)
            setOrdersError(
              e instanceof Error ? e.message : "Error al cargar órdenes",
            );
        }
      };

      const loadVouchers = async () => {
        if (restaurantId == null) return;
        try {
          const all: Voucher[] = [];
          let page = 1;
          let totalPages = 1;
          do {
            const res = await getVouchers(
              token,
              restaurantId,
              branchId,
              since,
              until,
              page,
            );
            all.push(...res.data);
            totalPages = res.total_pages;
            page += 1;
          } while (page <= totalPages && page <= MAX_VOUCHER_PAGES);
          if (cancelled) return;
          setVouchers(all);
          setVouchersError(null);
        } catch (e) {
          if (!cancelled)
            setVouchersError(
              e instanceof Error ? e.message : "Error al cargar comprobantes",
            );
        }
      };

      await Promise.all([loadOrders(), loadVouchers()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, branchId, restaurantId, filter, tick]);

  const summary = useMemo(() => summarizeOrders(orders), [orders]);
  const visibleOrders = useMemo(
    () => filterOrders(orders, query),
    [orders, query],
  );

  return {
    filter,
    setFilter,
    query,
    setQuery,
    months,
    orders,
    visibleOrders,
    vouchers,
    summary,
    loading,
    ordersError,
    vouchersError,
    refresh,
  };
}

export type CajaData = ReturnType<typeof useCajaData>;

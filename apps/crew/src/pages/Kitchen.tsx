import { useCallback, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import OrderCarousel from "../components/OrderCarousel";
import { useRegisterRefresh } from "../app/refresh";
import { syncTapPayOrderFromPOS, saveFcmToken } from "../services/api";
import type { Branch } from "../services/api";
import type { DishStatus, CookingStatus, Order } from "../types";
import { isTauri } from "../lib/platform";

async function showWindow() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("show_main_window");
  } catch {}
}

async function syncHasOrders(hasOrders: boolean) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_has_orders", { hasOrders });
  } catch {}
}

async function registerFcmToken(authToken: string) {
  const MAX_ATTEMPTS = 6;
  const DELAY_MS = 3000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const token = await invoke<string | null>("get_fcm_token");
      if (token) {
        await saveFcmToken(authToken, token, "android");
        return;
      }
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

async function requestNotificationPermission() {
  try {
    const { isPermissionGranted, requestPermission } = await import(
      "@tauri-apps/plugin-notification"
    );
    const granted = await isPermissionGranted();
    if (!granted) await requestPermission();
  } catch {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }
}

const APP_LABEL = import.meta.env.VITE_APP_LABEL || "Even Crew";

interface Props {
  orders: Order[];
  loading: boolean;
  error: string | null;
  fetchOrders: (showSpinner?: boolean) => Promise<unknown>;
  updateDish: (
    orderId: string,
    orderType: string,
    dishId: string,
    status: DishStatus,
  ) => Promise<void>;
  updateOrderCookingStatus: (
    orderId: string,
    status: CookingStatus,
  ) => Promise<void>;
  updatePrepTimeExtraMinutes: (
    orderId: string,
    extraMinutes: number,
  ) => Promise<void>;
  branches: Branch[];
  branchesLoading: boolean;
  branchId: string | null;
  availableWaiters: { id: string; name: string }[];
  waiterSession: { id: string; name: string } | null;
  requireWaiterLogin: (
    onSuccess: (waiter: { id: string; name: string }) => void,
    options?: { forcePicker?: boolean },
  ) => void;
}

export default function Kitchen({
  orders,
  loading,
  error,
  fetchOrders,
  updateDish,
  updateOrderCookingStatus,
  updatePrepTimeExtraMinutes,
  branches,
  branchesLoading,
  branchId,
  availableWaiters,
  waiterSession,
  requireWaiterLogin,
}: Props) {
  const { getToken } = useAuth();

  useEffect(() => {
    if (!isTauri()) return;
    requestNotificationPermission();
    getToken().then((t) => {
      if (t) registerFcmToken(t);
    });
  }, [getToken]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/plugin-notification")
      .then(({ onAction }) => onAction(() => showWindow()))
      .then((listener) => {
        unlisten = () => listener.unregister();
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    syncHasOrders(orders.length > 0);
  }, [orders.length]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onFocusChanged(({ payload: focused }) => {
          if (focused) fetchOrders();
        }),
      )
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, [fetchOrders]);

  const handleActualizar = useCallback(
    async (showSpinner = true) => {
      const tapPayOrders = orders.filter((o) => o.orderType === "tap_pay");
      if (tapPayOrders.length > 0) {
        const token = await getToken();
        if (token) {
          await Promise.allSettled(
            tapPayOrders.map((o) =>
              syncTapPayOrderFromPOS(o.id, token).catch(() => {}),
            ),
          );
        }
      }
      fetchOrders(showSpinner);
    },
    [orders, getToken, fetchOrders],
  );

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && !loading) {
        handleActualizar(false);
      }
    }, 45_000);
    return () => clearInterval(id);
  }, [handleActualizar, loading]);

  useRegisterRefresh(() => handleActualizar(true), loading);

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col"
      style={{ background: "#023828" }}
    >
      {/* Logo central */}
      <div className="flex flex-col items-center pb-6 gap-1">
        <h1 className="text-even-offwhite font-medium text-xl uppercase tracking-widest">
          {APP_LABEL}
        </h1>
      </div>

      {/* Panel claro inferior (Offwhite body) */}
      <div
        className="flex-1 rounded-t-lg px-5 pt-5 pb-6 flex flex-col min-h-0 text-even-evergreen"
        style={{ background: "#FEFEEB" }}
      >
        {branchesLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-even-evergreen/15 border-t-even-grass rounded-full animate-spin" />
          </div>
        ) : !branchId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-even-evergreen/70">
            <p className="font-medium text-even-evergreen">
              Selecciona una sucursal
            </p>
            <p className="text-sm text-center">
              Usa el selector de arriba para elegir la sucursal que deseas
              monitorear.
            </p>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-even-evergreen/15 border-t-even-grass rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-even-evergreen/70">
            <p className="font-medium text-even-evergreen">
              Error al cargar órdenes
            </p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => fetchOrders(true)}
              className="px-4 py-2 bg-even-grass text-even-evergreen rounded-md text-xs uppercase tracking-wider font-medium hover:bg-even-grass/90 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <OrderCarousel
            orders={orders}
            onDishStatusChange={updateDish}
            onOrderCookingStatusChange={updateOrderCookingStatus}
            onPrepTimeExtraChange={updatePrepTimeExtraMinutes}
            currentBranch={branches.find((b) => b.id === branchId) ?? null}
            onOrdersRefresh={() => fetchOrders()}
            availableWaiters={availableWaiters}
            waiterSession={waiterSession}
            requireWaiterLogin={requireWaiterLogin}
          />
        )}
      </div>
    </div>
  );
}

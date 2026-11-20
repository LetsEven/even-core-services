import { useState, useCallback, useContext, useEffect, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../../lib/auth";
import { LocalAuthContext } from "../../lib/auth/localContext";
import { pickLocalBranch, scopeBranches } from "./branchScope";
import { useSocket } from "../../hooks/useSocket";
import type { CrewDevice } from "../../hooks/useSocket";
import { usePrinting } from "../../hooks/usePrinting";
import { useKitchenOrders } from "../../hooks/useKitchenOrders";
import { getBranches, getWaiters } from "../../services/api";
import type { Branch } from "../../services/api";
import type { DishStatus } from "../../types";
import { getOrCreateDeviceId } from "../../utils/deviceId";
import { getActiveOrderTypes } from "../../services/serviceMapping";
import NewOrderToasts, { type OrderNotif } from "../../components/NewOrderToasts";
import WaiterLoginModal from "../../components/WaiterLoginModal";
import { useWaiterSession } from "../../hooks/useWaiterSession";
import { useWakeLock } from "../../hooks/useWakeLock";
import { useAudioUnlock } from "../../hooks/useAudioUnlock";
import { useClearAppBadge } from "../../hooks/useClearAppBadge";
import { isTauri } from "../../lib/platform";
import { playNotificationSound } from "../../lib/sound";
import { syncWebPushToken } from "../../lib/webPush";
import { resolveCrewConfig } from "../../features/config/crewConfig";
import { SessionContext, type SessionValue } from "./context";

const APP_LABEL = import.meta.env.VITE_APP_LABEL || "Even Crew";

async function showWindowIfNeeded() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("show_main_window");
  } catch {}
}

async function flashTaskbarIcon() {
  try {
    const { getCurrentWindow, UserAttentionType } = await import(
      "@tauri-apps/api/window"
    );
    await getCurrentWindow().requestUserAttention(UserAttentionType.Critical);
  } catch {}
}

// Inicializar permisos de notificación al arrancar (no en cada orden)
async function initNotifications() {
  // En web el permiso solo se puede pedir tras un toque (llega con las push de la PWA)
  if (!isTauri()) return;
  try {
    const { isPermissionGranted, requestPermission } = await import(
      "@tauri-apps/plugin-notification"
    );
    const granted = await isPermissionGranted();
    if (!granted) await requestPermission();
    console.log("[CREW:NOTIF] Permisos inicializados");
  } catch {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }
}

async function sendDesktopNotification(title: string, body: string) {
  // En web avisan el toast y el sonido; new Notification() truena en iOS
  if (!isTauri()) return;
  console.log(`[CREW:NOTIF] Enviando notificación: ${title} — ${body}`);
  try {
    // Usar comando Rust con PowerShell toast — más confiable en .exe portable Windows
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("notify_new_order", { title, body });
    console.log("[CREW:NOTIF] Notificación enviada via Rust");
  } catch (e) {
    console.warn("[CREW:NOTIF] Rust falló, intentando plugin Tauri:", e);
    try {
      const { sendNotification } = await import(
        "@tauri-apps/plugin-notification"
      );
      await sendNotification({ title, body });
    } catch (e2) {
      console.warn("[CREW:NOTIF] Plugin falló, intentando Web API:", e2);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body });
      }
    }
  }
}

export default function SessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { status, getToken, kind, user } = useAuth();
  const isSignedIn = status === "signedIn";
  // Modo local: la sucursal es la del dispositivo emparejado (ver branchScope).
  const localCtx = useContext(LocalAuthContext);
  const localMode = kind === "local";
  const deviceBranchId = localMode ? (localCtx?.branchId ?? null) : null;
  const isSuper = user?.role === "super";
  const branchFixed = localMode && !isSuper;
  const [branchState, setBranchId] = useState<string | null>(() =>
    localMode ? deviceBranchId : localStorage.getItem("crew_branch_id"),
  );
  const branchId = branchFixed ? deviceBranchId : branchState;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  // Lista de meseros de la sucursal (Soft Restaurant) — vive a nivel App
  // para que la compartan Kitchen y Mesas, y para armar la sesión de
  // mesero por dispositivo (ver useWaiterSession).
  const [availableWaiters, setAvailableWaiters] = useState<
    { id: string; name: string }[]
  >([{ id: "EVEN", name: "EVEN" }]);
  // Sesión de mesero por dispositivo: quién está "logueado" en este
  // dispositivo para esta sucursal (persistida en localStorage). El modal
  // aparece solo o al iniciar la app (si no hay sesión y hay meseros reales,
  // con opción de seguir como invitado) o cuando una acción puntual la
  // requiere (agregar platillo, reclamar una orden, abrir mesa — ver
  // requireWaiterLogin en HomeScreenProps).
  const { waiterSession, modalOpen, allowGuest, resolveLogin, requireLogin } =
    useWaiterSession(branchId, availableWaiters);

  // Identidad y presencia de dispositivos
  const deviceId = getOrCreateDeviceId();
  const [connectedDevices, setConnectedDevices] = useState<CrewDevice[]>([]);
  const [masterDeviceId, setMasterDeviceId] = useState<string | null>(null);


  // Cola de notificaciones por orden — vive en App para no perderse al navegar
  const [newOrderNotifications, setNewOrderNotifications] = useState<
    OrderNotif[]
  >([]);
  const prevOrderIdsRef = useRef<Set<string> | null>(null);

  // Inicializar permisos de notificación una sola vez al arrancar
  useEffect(() => {
    initNotifications();
  }, []);

  useWakeLock(!!isSignedIn && !isTauri());
  useAudioUnlock(!isTauri());
  useClearAppBadge(!!isSignedIn && !isTauri());

  useEffect(() => {
    if (!isSignedIn || isTauri()) return;
    getToken().then((t) => {
      if (t) syncWebPushToken(t);
    });
  }, [isSignedIn, getToken]);

  // F12 abre DevTools
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        import("@tauri-apps/api/core")
          .then(({ invoke }) => invoke("open_devtools"))
          .catch(() => {});
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Cargar sucursales al estar autenticado. Justo tras un primer login el
  // token de Clerk o el registro de sucursal en el backend pueden no estar
  // listos todavía, así que se reintenta una vez antes de darse por vencido
  // (antes fallaba en silencio y dejaba el selector de sucursal roto hasta
  // que la página de Impresoras, que hacía su propio fetch, lo "arreglaba").
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;

    const loadBranches = async (retriesLeft: number) => {
      setBranchesLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Token no disponible todavía");
        const list = await getBranches(token);
        if (cancelled) return;
        if (localMode) {
          const allowed = scopeBranches(list, deviceBranchId, isSuper);
          setBranches(allowed);
          if (!branchFixed) {
            setBranchId((prev) => {
              const chosen = pickLocalBranch(
                allowed,
                deviceBranchId,
                prev,
                localStorage.getItem("crew_branch_id"),
              );
              return chosen;
            });
          }
          setBranchesLoading(false);
          return;
        }
        setBranches(list);
        // Auto-seleccionar sucursal por defecto en el primer login: conserva
        // la guardada si sigue siendo válida, si no usa la primera. Evita que
        // Kitchen quede sin sucursal activa al iniciar.
        setBranchId((prev) => {
          if (prev && list.some((b) => b.id === prev)) return prev;
          const saved = localStorage.getItem("crew_branch_id");
          const chosen =
            (saved && list.find((b) => b.id === saved)?.id) ??
            list[0]?.id ??
            null;
          if (chosen) localStorage.setItem("crew_branch_id", chosen);
          return chosen;
        });
        setBranchesLoading(false);
      } catch (err) {
        console.error("[CREW] Error al cargar sucursales:", err);
        if (cancelled) return;
        if (retriesLeft > 0) {
          setTimeout(() => loadBranches(retriesLeft - 1), 1500);
        } else {
          setBranchesLoading(false);
        }
      }
    };

    loadBranches(1);
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken, localMode, deviceBranchId, isSuper, branchFixed]);

  useEffect(() => {
    if (!isSignedIn || !branchId) {
      setAvailableWaiters([{ id: "EVEN", name: "EVEN" }]);
      return;
    }
    getToken().then((t) => {
      if (!t) return;
      getWaiters(branchId, t)
        .then(setAvailableWaiters)
        .catch(() => setAvailableWaiters([{ id: "EVEN", name: "EVEN" }]));
    });
  }, [isSignedIn, branchId, getToken]);

  const changeBranch = useCallback((id: string) => {
    if (branchFixed) return;
    // En local solo se cambia entre las sucursales permitidas.
    if (localMode && !branches.some((b) => b.id === id)) return;
    setBranchId((prev) => {
      if (id !== prev) {
        setConnectedDevices([]);
        setMasterDeviceId(null);
      }
      return id;
    });
    localStorage.setItem("crew_branch_id", id);
  }, [branchFixed, localMode, branches]);

  // Hooks que deben vivir toda la sesión (independiente de la página activa)
  const {
    printJob,
    setMasterDeviceId: setPrintingMaster,
    refreshPrinters,
  } = usePrinting(branchId);

  const handleDevicesUpdated = useCallback(
    (devices: CrewDevice[], master: string | null) => {
      setConnectedDevices(devices);
      // Si el master llega como null (se perdió por alguna razón), conservar el
      // master previo para no perder la impresión del ticket. Solo actualizar
      // cuando llega un master real (no-null).
      if (master !== null) {
        setMasterDeviceId(master);
        setPrintingMaster(master);
      }
    },
    [setPrintingMaster],
  );

  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    fetchOrders,
    updateDish,
    updateDishQuantity,
    updateOrderCookingStatus,
    updatePrepTimeExtraMinutes,
    removeOrder,
    updateDishFromSocket,
  } = useKitchenOrders(branchId, isSignedIn);

  const handleOrderClosed = useCallback(
    (orderId: string) => removeOrder(orderId),
    [removeOrder],
  );
  const handleDishStatusChanged = useCallback(
    (dishId: string, status: DishStatus) =>
      updateDishFromSocket(dishId, status),
    [updateDishFromSocket],
  );
  // Resetear tracking de notificaciones al cambiar de sucursal o de sesión
  useEffect(() => {
    prevOrderIdsRef.current = null;
    setNewOrderNotifications([]);
  }, [branchId, isSignedIn]);

  // Inicializar prevOrderIdsRef tras la primera carga real (sin notificar).
  // Solo cuando la carga terminó (!ordersLoading) para evitar inicializar
  // con [] mientras las órdenes aún están cargando tras un cambio de sucursal.
  useEffect(() => {
    if (prevOrderIdsRef.current === null && !ordersLoading) {
      prevOrderIdsRef.current = new Set(orders.map((o) => o.id));
    }
  }, [orders, ordersLoading]);

  const handleRefetch = useCallback(async () => {
    console.log(
      "[CREW:ORDER] Nueva orden recibida — ejecutando refetch + notificación",
    );
    const fetched = await fetchOrders();
    if (!fetched) return;

    if (prevOrderIdsRef.current === null) {
      prevOrderIdsRef.current = new Set(fetched.map((o) => o.id));
      return;
    }

    // Toast solo para Pick & Go — los demás servicios ya avisan "nuevo/no
    // visto" con el pulse del croquis (Mesas), así que un toast
    // aparte sería ruido duplicado. Pick & Go es lista simple, sin pulse.
    const newOnes = fetched.filter(
      (o) =>
        !prevOrderIdsRef.current!.has(o.id) && o.orderType === "pick_and_go",
    );
    prevOrderIdsRef.current = new Set(fetched.map((o) => o.id));

    if (newOnes.length === 0) return;

    setNewOrderNotifications((prev) => [
      ...prev,
      ...newOnes.map((o) => ({
        id: o.id,
        folio: o.folio ?? null,
        customerName: o.customerName ?? null,
        identifier: o.identifier,
        orderedBy: o.dishes.find((d) => d.orderedBy)?.orderedBy ?? null,
      })),
    ]);
    playNotificationSound();
    flashTaskbarIcon();
    sendDesktopNotification(
      APP_LABEL,
      newOnes.length === 1
        ? "Nueva orden recibida"
        : `${newOnes.length} nuevas órdenes`,
    );
    showWindowIfNeeded();
  }, [fetchOrders]);

  const handleDismissAlert = useCallback((id: string) => {
    setNewOrderNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleTurnoClosed = useCallback(
    (data: { identifier: string | null; branchNumber: number | null }) => {
      const currentBranchNumber =
        branches.find((b) => b.id === branchId)?.branch_number ?? null;
      if (
        data.branchNumber !== null &&
        data.branchNumber !== currentBranchNumber
      )
        return;

      const body = data.identifier
        ? `${data.identifier} intentó ordenar pero el turno está cerrado`
        : "Un cliente intentó ordenar pero el turno está cerrado";
      setNewOrderNotifications((prev) => [
        ...prev,
        {
          id: `turno-closed-${Date.now()}`,
          folio: null,
          customerName: null,
          identifier: body,
          orderedBy: null,
          title: "Turno cerrado",
        },
      ]);
      playNotificationSound();
      flashTaskbarIcon();
      sendDesktopNotification(APP_LABEL, body);
      showWindowIfNeeded();
    },
    [branches, branchId],
  );

  const handleSilentRefetch = useCallback(() => {
    fetchOrders();
  }, [fetchOrders]);

  const { setMaster } = useSocket({
    branchId,
    deviceId,
    onOrderClosed: handleOrderClosed,
    onDishStatusChanged: handleDishStatusChanged,
    onRefetch: handleRefetch,
    onSilentRefetch: handleSilentRefetch,
    onPrintJob: printJob,
    onDevicesUpdated: handleDevicesUpdated,
    onTurnoClosed: handleTurnoClosed,
  });

  const currentBranch = branches.find((b) => b.id === branchId);
  const activeOrderTypes = useMemo(
    () => getActiveOrderTypes(currentBranch?.services),
    [currentBranch?.services],
  );
  const crewConfig = useMemo(
    () => resolveCrewConfig(currentBranch?.crew_config),
    [currentBranch?.crew_config],
  );

  const value: SessionValue = {
    deviceId,
    branchId,
    branches,
    branchesLoading,
    currentBranch,
    changeBranch,
    activeOrderTypes,
    crewConfig,
    availableWaiters,
    waiterSession,
    requireWaiterLogin: requireLogin,
    orders,
    ordersLoading,
    ordersError,
    fetchOrders,
    updateDish,
    updateDishQuantity,
    updateOrderCookingStatus,
    updatePrepTimeExtraMinutes,
    connectedDevices,
    masterDeviceId,
    setMaster,
    refreshPrinters,
  };

  return (
    <SessionContext.Provider value={value}>
      {isSignedIn && modalOpen && branchId && (
        <WaiterLoginModal
          branchId={branchId}
          availableWaiters={availableWaiters}
          allowGuest={allowGuest}
          onResolved={resolveLogin}
          currentWaiterId={waiterSession?.id}
        />
      )}
      {isSignedIn && (
        <NewOrderToasts
          notifications={newOrderNotifications}
          onDismiss={handleDismissAlert}
        />
      )}
      {children}
    </SessionContext.Provider>
  );
}

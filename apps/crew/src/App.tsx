import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth, useSignIn } from "@clerk/clerk-react";
import { Mail, KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import Printers from "./pages/Printers";
import Historial from "./pages/Historial";
import Comprobantes from "./pages/Comprobantes";
import { useSocket } from "./hooks/useSocket";
import type { CrewDevice } from "./hooks/useSocket";
import { usePrinting } from "./hooks/usePrinting";
import { useKitchenOrders } from "./hooks/useKitchenOrders";
import { getBranches, getWaiters } from "./services/api";
import type { Branch } from "./services/api";
import type { DishStatus, OrderType } from "./types";
import { getOrCreateDeviceId } from "./utils/deviceId";
import { getActiveOrderTypes } from "./services/serviceMapping";
import { SERVICE_REGISTRY } from "./services/registry";
import NewOrderToasts, { type OrderNotif } from "./components/NewOrderToasts";
import ServiceSwitcher from "./components/ServiceSwitcher";
import WaiterLoginModal from "./components/WaiterLoginModal";
import { useWaiterSession } from "./hooks/useWaiterSession";
import { useWakeLock } from "./hooks/useWakeLock";
import { useAudioUnlock } from "./hooks/useAudioUnlock";
import { useClearAppBadge } from "./hooks/useClearAppBadge";
import { isTauri } from "./lib/platform";
import { playNotificationSound } from "./lib/sound";
import { syncWebPushToken } from "./lib/webPush";

type Page = "home" | "printers" | "historial" | "comprobantes";

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

export default function App() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signIn, setActive } = useSignIn();
  const [page, setPage] = useState<Page>("home");
  const [branchId, setBranchId] = useState<string | null>(() =>
    localStorage.getItem("crew_branch_id"),
  );
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  // Solo relevante si la sucursal tiene 2+ servicios activos (caso raro) —
  // ver ServiceSwitcher. Si el valor guardado ya no está entre los activos
  // (cambio de sucursal, o el servicio se dio de baja), se recalcula abajo.
  const [selectedOrderType, setSelectedOrderType] = useState<OrderType | null>(
    null,
  );
  // Lista de meseros de la sucursal (Soft Restaurant) — vive a nivel App
  // para que la compartan Kitchen y SpatialGrid, y para armar la sesión de
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
  }, [isSignedIn, getToken]);

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

  const handleBranchChange = useCallback((id: string) => {
    setBranchId((prev) => {
      if (id !== prev) {
        setConnectedDevices([]);
        setMasterDeviceId(null);
      }
      return id;
    });
    localStorage.setItem("crew_branch_id", id);
  }, []);

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
  } = useKitchenOrders(branchId);

  const handleOrderClosed = useCallback(
    (orderId: string) => removeOrder(orderId),
    [removeOrder],
  );
  const handleDishStatusChanged = useCallback(
    (dishId: string, status: DishStatus) =>
      updateDishFromSocket(dishId, status),
    [updateDishFromSocket],
  );
  // Resetear tracking de notificaciones al cambiar de sucursal
  useEffect(() => {
    prevOrderIdsRef.current = null;
    setNewOrderNotifications([]);
  }, [branchId]);

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
    // visto" con el pulse del croquis (SpatialGrid), así que un toast
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn) return;

    setLoading(true);
    setError("");

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive!({ session: result.createdSessionId });
      } else {
        setError("Error al iniciar sesión. Intenta de nuevo.");
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || "Credenciales incorrectas.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#023828" }}
      >
        <div className="w-8 h-8 border-4 border-white/15 border-t-even-grass rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div
        className="min-h-screen flex flex-col justify-center items-center px-6"
        style={{ background: "#023828" }}
      >
        <div className="w-full max-w-sm flex flex-col items-center">
          <div className="mb-8 flex flex-col items-center gap-3">
            <img
              src="/even/even-asterisk-grass.svg"
              alt="Even"
              className="w-16 h-16"
            />
            <h1 className="text-even-offwhite text-2xl font-medium uppercase tracking-widest">
              {APP_LABEL}
            </h1>
            <p className="text-even-offwhite/60 text-xs uppercase tracking-widest">
              Inicia sesión para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-even-offwhite/40 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Email"
                autoComplete="username email"
                className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-md text-even-offwhite placeholder:text-even-offwhite/30 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent"
              />
            </div>

            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-even-offwhite/40 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Contraseña"
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-3 bg-white/10 border border-white/20 rounded-md text-even-offwhite placeholder:text-even-offwhite/30 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-even-offwhite/40 hover:text-even-offwhite/70 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {error && <p className="text-rose-400 text-sm px-1">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full py-3 rounded-md text-even-evergreen font-medium text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              style={{ background: "#82E657" }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Entrando..." : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (page === "printers") {
    return (
      <Printers
        onBack={() => setPage("home")}
        deviceId={deviceId}
        connectedDevices={connectedDevices}
        masterDeviceId={masterDeviceId}
        setMaster={setMaster}
        branches={branches}
        branchesLoading={branchesLoading}
        branchId={branchId}
        onBranchChange={handleBranchChange}
        onPrintersChanged={refreshPrinters}
      />
    );
  }

  if (page === "historial") {
    return (
      <Historial
        onBack={() => setPage("home")}
        onOpenPrinters={() => setPage("printers")}
        branches={branches}
        branchesLoading={branchesLoading}
        branchId={branchId}
        onBranchChange={handleBranchChange}
      />
    );
  }

  if (page === "comprobantes") {
    return (
      <Comprobantes
        onBack={() => setPage("home")}
        branches={branches}
        branchesLoading={branchesLoading}
        branchId={branchId}
        onBranchChange={handleBranchChange}
      />
    );
  }

  // Pantalla principal — resuelta por servicio contratado (clients.services,
  // ver serviceMapping.ts). Fallback a Pick & Go si no hay servicio mapeable
  // (branch/cliente sin `services` bien cargado) — es la pantalla más
  // genérica y coincide con el comportamiento previo a este cambio.
  const currentBranch = branches.find((b) => b.id === branchId);
  const activeOrderTypes = getActiveOrderTypes(currentBranch?.services);
  // Si hay 2+ servicios, usa la selección del switcher (si sigue siendo
  // válida para esta sucursal); si no, o si solo hay 1, toma el primero.
  const resolvedOrderType =
    (selectedOrderType && activeOrderTypes.includes(selectedOrderType)
      ? selectedOrderType
      : activeOrderTypes[0]) ?? "pick_and_go";
  const HomeScreen = SERVICE_REGISTRY[resolvedOrderType].HomeScreen;

  return (
    <div className="min-h-screen flex flex-col">
      {modalOpen && branchId && (
        <WaiterLoginModal
          branchId={branchId}
          availableWaiters={availableWaiters}
          allowGuest={allowGuest}
          onResolved={resolveLogin}
          currentWaiterId={waiterSession?.id}
        />
      )}
      <NewOrderToasts
        notifications={newOrderNotifications}
        onDismiss={handleDismissAlert}
      />      <ServiceSwitcher
        activeOrderTypes={activeOrderTypes}
        selected={resolvedOrderType}
        onSelect={setSelectedOrderType}
      />
      {/* flex-1 + min-h-0: el HomeScreen llena el espacio restante (no su
          propio 100vh completo) para que el switcher no empuje scroll extra */}
      <div className="flex-1 flex flex-col min-h-0">
        <HomeScreen
          onOpenPrinters={() => setPage("printers")}
          onOpenHistorial={() => setPage("historial")}
          onOpenComprobantes={() => setPage("comprobantes")}
          branchId={branchId}
          branches={branches}
          branchesLoading={branchesLoading}
          onBranchChange={handleBranchChange}
          orders={orders}
          ordersLoading={ordersLoading}
          ordersError={ordersError}
          fetchOrders={fetchOrders}
          updateDish={updateDish}
          updateDishQuantity={updateDishQuantity}
          updateOrderCookingStatus={updateOrderCookingStatus}
          updatePrepTimeExtraMinutes={updatePrepTimeExtraMinutes}
          availableWaiters={availableWaiters}
          waiterSession={waiterSession}
          requireWaiterLogin={requireLogin}
        />
      </div>
    </div>
  );
}

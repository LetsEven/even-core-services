import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Outlet } from "react-router";
import NavBar from "./NavBar";
import NavRail from "./NavRail";
import TopBar from "./TopBar";
import { RefreshContext, type RefreshRegistry } from "./refresh";
import { useSession } from "./session/context";
import { isDemoMode } from "../lib/demoMode";

// Banner permanente del modo demo (codigo en src/demo, solo se carga en demo).
const DemoBanner = lazy(() => import("../demo/DemoBanner"));

// Marco de la app autenticada: TopBar + contenido + NavBar (<lg) / NavRail (lg+).
export default function AppShell() {
  const { fetchOrders, ordersLoading } = useSession();
  const handlerRef = useRef<(() => void) | null>(null);
  const [pageBusy, setPageBusy] = useState(false);
  const [hasHandler, setHasHandler] = useState(false);

  const registry = useMemo<RefreshRegistry>(
    () => ({
      register: (fn, busy) => {
        handlerRef.current = fn;
        setHasHandler(fn !== null);
        setPageBusy(busy);
      },
    }),
    [],
  );

  const onRefresh = useCallback(() => {
    if (handlerRef.current) handlerRef.current();
    else fetchOrders(true);
  }, [fetchOrders]);

  return (
    <RefreshContext.Provider value={registry}>
      <div className="h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex bg-even-evergreen">
        <NavRail />
        <div className="flex-1 min-w-0 flex flex-col">
          {isDemoMode() && (
            <Suspense fallback={null}>
              <DemoBanner />
            </Suspense>
          )}
          <TopBar
            onRefresh={onRefresh}
            refreshing={hasHandler ? pageBusy : ordersLoading}
          />
          <main className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            <Outlet />
          </main>
          <NavBar />
        </div>
      </div>
    </RefreshContext.Provider>
  );
}

import { Navigate, useNavigate } from "react-router";
import Printers from "../pages/Printers";
import Historial from "../pages/Historial";
import Comprobantes from "../pages/Comprobantes";
import TablesBoard from "../components/TablesBoard";
import { PickAndGoHome } from "../services/homeScreens";
import { AppLoader, NoAccess } from "./guards";
import { firstAllowedPath, useAuth } from "../lib/auth";
import { useSession } from "./session/context";
import { useHomeScreenProps } from "./useHomeScreenProps";
import DevicesPanel from "../components/DevicesPanel";

// "/" decide el destino inicial: Pick & Go solo -> Cocina; si no, Mesas. Si el
// rol no puede ver esa vista, va a la primera que si pueda (cocina -> /cocina).
export function HomeRedirect() {
  const { branchesLoading, currentBranch, activeOrderTypes } = useSession();
  const { hasPermission } = useAuth();
  if (branchesLoading || !currentBranch) return <AppLoader />;
  const onlyPickAndGo =
    activeOrderTypes.length === 1 && activeOrderTypes[0] === "pick_and_go";
  const target = firstAllowedPath(
    hasPermission,
    onlyPickAndGo ? "/cocina" : "/mesas",
  );
  if (!target) return <NoAccess />;
  return <Navigate to={target} replace />;
}

// Mesas: todas las mesas juntas; el servicio es un atributo de cada cuenta.
export function MesasPage() {
  const s = useSession();
  const { hasPermission } = useAuth();
  return (
    <TablesBoard
      branchId={s.branchId}
      branches={s.branches}
      branchesLoading={s.branchesLoading}
      orders={s.orders}
      activeOrderTypes={s.activeOrderTypes}
      crewConfig={s.crewConfig}
      onOrdersRefresh={() => s.fetchOrders()}
      onPickAndGoStatusChange={s.updateOrderCookingStatus}
      pickAndGoReadOnly={
        !hasPermission("cocina.operar") && !hasPermission("cuenta.ver")
      }
    />
  );
}

export function CocinaPage() {
  // Sin cocina.operar la vista es de solo lectura (no cambia estados).
  const { hasPermission } = useAuth();
  return (
    <PickAndGoHome
      {...useHomeScreenProps()}
      readOnly={!hasPermission("cocina.operar")}
    />
  );
}

export function HistorialPage() {
  return <Historial />;
}

export function ComprobantesPage() {
  return <Comprobantes />;
}

export function PrintersPage() {
  const s = useSession();
  const navigate = useNavigate();
  return (
    <Printers
      onBack={() => navigate("/ajustes")}
      deviceId={s.deviceId}
      connectedDevices={s.connectedDevices}
      masterDeviceId={s.masterDeviceId}
      setMaster={s.setMaster}
      branchesLoading={s.branchesLoading}
      branchId={s.branchId}
      onPrintersChanged={s.refreshPrinters}
    />
  );
}

export function DevicesPage() {
  const s = useSession();
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/ajustes")}
          className="text-even-offwhite/60 hover:text-even-offwhite text-xs uppercase tracking-wider cursor-pointer"
        >
          Ajustes
        </button>
        <span className="text-even-offwhite/30">/</span>
        <h1 className="text-even-offwhite font-medium text-base uppercase tracking-widest">
          Dispositivos
        </h1>
      </div>
      <div className="flex-1 rounded-t-lg px-5 pt-6 pb-6 flex flex-col gap-4 bg-even-offwhite text-even-evergreen">
        <DevicesPanel
          deviceId={s.deviceId}
          connectedDevices={s.connectedDevices}
          masterDeviceId={s.masterDeviceId}
          setMaster={s.setMaster}
        />
      </div>
    </div>
  );
}

// Placeholders: otros lotes llenan la cuenta de mesa y la comanda.
export function ProximamentePage({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 bg-even-offwhite text-even-evergreen">
      <h1 className="font-medium text-lg uppercase tracking-widest">{title}</h1>
      <p className="text-sm text-even-evergreen/60">Próximamente.</p>
      <button
        onClick={() => navigate("/mesas")}
        className="text-xs uppercase tracking-wider underline cursor-pointer"
      >
        Volver a Mesas
      </button>
    </div>
  );
}

import { Navigate, useNavigate } from "react-router";
import Printers from "../pages/Printers";
import Historial from "../pages/Historial";
import Comprobantes from "../pages/Comprobantes";
import { SERVICE_REGISTRY } from "../services/registry";
import { PickAndGoHome } from "../services/homeScreens";
import { AppLoader } from "./guards";
import { useSession } from "./session/context";
import { useHomeScreenProps } from "./useHomeScreenProps";
import DevicesPanel from "../components/DevicesPanel";

// "/" decide el destino inicial: Pick & Go solo -> Cocina; si no, Mesas.
export function HomeRedirect() {
  const { branchesLoading, currentBranch, activeOrderTypes } = useSession();
  if (branchesLoading || !currentBranch) return <AppLoader />;
  const onlyPickAndGo =
    activeOrderTypes.length === 1 && activeOrderTypes[0] === "pick_and_go";
  return <Navigate to={onlyPickAndGo ? "/cocina" : "/mesas"} replace />;
}

// Mesas: pantalla principal según el servicio contratado (SERVICE_REGISTRY).
export function MesasPage() {
  const props = useHomeScreenProps();
  const { resolvedOrderType } = useSession();
  const HomeScreen = SERVICE_REGISTRY[resolvedOrderType].HomeScreen;
  return <HomeScreen {...props} />;
}

export function CocinaPage() {
  return <PickAndGoHome {...useHomeScreenProps()} />;
}

export function HistorialPage() {
  const s = useSession();
  const navigate = useNavigate();
  return (
    <Historial
      onBack={() => navigate(-1)}
      branchesLoading={s.branchesLoading}
      branchId={s.branchId}
    />
  );
}

export function ComprobantesPage() {
  const s = useSession();
  const navigate = useNavigate();
  return (
    <Comprobantes
      onBack={() => navigate(-1)}
      branches={s.branches}
      branchesLoading={s.branchesLoading}
      branchId={s.branchId}
    />
  );
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

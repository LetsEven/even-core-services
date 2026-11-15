import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button, cn } from "@even/ui";
import type { CrewDevice } from "../../hooks/useSocket";
import { isTauri } from "../../lib/platform";
import { useBridgeStatus } from "./bridgeStatus";
import { getPrintingStatus, type PrintingStatus } from "./printingStatus";

interface Props {
  deviceId: string;
  connectedDevices: CrewDevice[];
  masterDeviceId: string | null;
  /** Marca este dispositivo como el que imprime los tickets. */
  setMaster: (deviceId: string) => void;
  /** Muestra también el estado cuando todo está bien (por defecto solo avisa del problema). */
  showOk?: boolean;
}

const REASON_TEXT = {
  "sin-dispositivo":
    "Ningún dispositivo con la app de Windows o Android está configurado para imprimir, y no hay bridge conectado.",
  "dispositivo-web":
    "El dispositivo elegido es la versión web, que no puede imprimir, y no hay bridge conectado.",
  "dispositivo-offline":
    "El dispositivo que imprime está sin conexión y no hay bridge conectado.",
} as const;

export function printingOkText(status: PrintingStatus): string | null {
  switch (status.kind) {
    case "bridge":
      return "Los tickets salen por el bridge de impresión.";
    case "este-equipo":
      return "Este dispositivo imprime los tickets.";
    case "otro-equipo":
      return "Otro dispositivo imprime los tickets.";
    default:
      return null;
  }
}

export default function PrintingBanner({
  deviceId,
  connectedDevices,
  masterDeviceId,
  setMaster,
  showOk = false,
}: Props) {
  const bridge = useBridgeStatus();
  const status = getPrintingStatus({
    deviceId,
    masterDeviceId,
    connectedDevices,
    canPrint: isTauri(),
    bridge,
  });

  if (status.kind !== "nadie") {
    const ok = printingOkText(status);
    if (!showOk || !ok) return null;
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl bg-even-grass/20 px-4 py-3 text-sm text-even-evergreen"
      >
        <CheckCircle2 className="size-4 shrink-0" />
        {ok}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-amber-900",
        "sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Nadie está imprimiendo</p>
          <p className="text-xs leading-relaxed">
            {REASON_TEXT[status.reason]}
            {!status.canActivateHere &&
              " La versión web no imprime: abre Crew en la app de Windows o Android."}
          </p>
        </div>
      </div>
      {status.canActivateHere && (
        <Button size="sm" onClick={() => setMaster(deviceId)}>
          Imprimir desde este dispositivo
        </Button>
      )}
    </div>
  );
}

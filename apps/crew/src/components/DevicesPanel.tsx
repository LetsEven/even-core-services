import { useMemo } from "react";
import { Crown, Monitor } from "lucide-react";
import type { CrewDevice } from "../hooks/useSocket";
import { isTauri } from "../lib/platform";

interface Props {
  deviceId: string;
  connectedDevices: CrewDevice[];
  masterDeviceId: string | null;
  setMaster: (deviceId: string) => void;
}

// Dispositivos conectados y cuál es el Master (el que imprime). Lo usan
// Impresoras y /ajustes/dispositivos.
export default function DevicesPanel({
  deviceId,
  connectedDevices,
  masterDeviceId,
  setMaster,
}: Props) {
  const canPrint = isTauri();

  // Siempre incluye este dispositivo para que "Este dispositivo" no desaparezca
  // durante reconexiones del socket o si la lista del servidor llega tarde.
  const displayedDevices = useMemo(() => {
    if (connectedDevices.some((d) => d.deviceId === deviceId))
      return connectedDevices;
    return [
      { deviceId, socketId: null, connectedAt: null, online: true },
      ...connectedDevices,
    ];
  }, [connectedDevices, deviceId]);

  return (
    <>
      {!canPrint && (
        <div
          className={`px-4 py-3 rounded-lg ring-1 text-xs leading-relaxed ${
            masterDeviceId === deviceId
              ? "bg-amber-500/15 ring-amber-500/30 text-amber-800"
              : "bg-even-evergreen/5 ring-even-evergreen/15 text-even-evergreen/70"
          }`}
        >
          {masterDeviceId === deviceId
            ? "Este dispositivo es el Master, pero la versión web no puede imprimir. Elige como Master un dispositivo con la app de Windows o Android."
            : "Versión web: este dispositivo no imprime. Los tickets salen desde el dispositivo Master (app de Windows o Android)."}
        </div>
      )}

      {/* Dispositivos conectados */}
      <div>
        <p className="text-even-evergreen/50 text-xs uppercase tracking-wide px-1 mb-2">
          Dispositivos conectados · {displayedDevices.length}
        </p>
        <ul className="flex flex-col gap-2">
          {displayedDevices.map((d) => {
            const isMe = d.deviceId === deviceId;
            const isMaster = d.deviceId === masterDeviceId;
            const isOffline = !d.online;
            const isWebDevice =
              d.platform === "web" || (isMe && !canPrint);
            return (
              <li
                key={d.deviceId}
                className={`flex items-center justify-between px-4 py-3 rounded-lg ring-1 shadow-sm transition-colors ${
                  isMaster && !isOffline
                    ? "bg-even-grass/20 ring-even-grass/40"
                    : isMaster && isOffline
                      ? "bg-amber-500/15 ring-amber-500/30"
                      : "bg-white ring-even-evergreen/20"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isMaster ? (
                    <Crown
                      className={`w-4 h-4 shrink-0 ${isOffline ? "text-amber-600" : "text-even-evergreen"}`}
                    />
                  ) : (
                    <Monitor className="w-4 h-4 text-even-evergreen/30 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        isMaster && !isOffline
                          ? "text-even-evergreen"
                          : isMaster && isOffline
                            ? "text-amber-700"
                            : "text-even-evergreen/70"
                      }`}
                    >
                      {isMe ? "Este dispositivo" : "Dispositivo"}
                      {isWebDevice && " · Web"}
                      {isMaster && !isOffline && " · Master"}
                      {isMaster && isOffline && " · Master (offline)"}
                    </p>
                    <p className="text-xs text-even-evergreen/30 font-mono">
                      {d.deviceId.slice(0, 8)}
                    </p>
                  </div>
                </div>
                {!isMaster && !isWebDevice && (
                  <button
                    onClick={() => setMaster(d.deviceId)}
                    className="ml-3 px-3 py-1.5 bg-even-evergreen/8 border border-even-evergreen/15 hover:bg-even-evergreen/15 text-even-evergreen/70 hover:text-even-evergreen text-xs uppercase tracking-wider rounded-md transition-colors cursor-pointer shrink-0"
                  >
                    Set Master
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

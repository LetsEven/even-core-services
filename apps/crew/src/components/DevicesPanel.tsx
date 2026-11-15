import { useMemo } from "react";
import { Monitor, Printer } from "lucide-react";
import { Badge, Button, Card } from "@even/ui";
import type { CrewDevice } from "../hooks/useSocket";
import { isTauri } from "../lib/platform";
import PrintingBanner from "../features/impresion/PrintingBanner";

interface Props {
  deviceId: string;
  connectedDevices: CrewDevice[];
  /** Dispositivo que imprime los tickets (en el backend sigue llamándose "master"). */
  masterDeviceId: string | null;
  setMaster: (deviceId: string) => void;
}

// Dispositivos conectados y cuál imprime los tickets. Solo dispositivos:
// las impresoras se configuran en /ajustes/impresoras.
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
      <PrintingBanner
        deviceId={deviceId}
        connectedDevices={connectedDevices}
        masterDeviceId={masterDeviceId}
        setMaster={setMaster}
        showOk
      />

      <div>
        <p className="mb-2 px-1 text-xs uppercase tracking-wide text-even-evergreen/50">
          Dispositivos conectados · {displayedDevices.length}
        </p>
        <ul className="flex flex-col gap-2">
          {displayedDevices.map((d) => {
            const isMe = d.deviceId === deviceId;
            const prints = d.deviceId === masterDeviceId;
            const isWebDevice = d.platform === "web" || (isMe && !canPrint);
            return (
              <li key={d.deviceId}>
                <Card
                  padding="sm"
                  className="flex items-center justify-between gap-3 px-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {prints ? (
                      <Printer className="size-4 shrink-0 text-even-evergreen" />
                    ) : (
                      <Monitor className="size-4 shrink-0 text-even-evergreen/30" />
                    )}
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-even-evergreen">
                        {isMe ? "Este dispositivo" : "Otro dispositivo"}
                        {isWebDevice && (
                          <Badge variant="neutral" size="sm">
                            Web
                          </Badge>
                        )}
                        {prints && (
                          <Badge variant={d.online ? "grass" : "neutral"} size="sm">
                            {d.online
                              ? "Imprime los tickets"
                              : "Imprime los tickets (sin conexión)"}
                          </Badge>
                        )}
                      </p>
                      <p className="font-mono text-xs text-even-evergreen/30">
                        {d.deviceId.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  {!prints && !isWebDevice && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setMaster(d.deviceId)}
                    >
                      {isMe ? "Imprimir desde este dispositivo" : "Que imprima este equipo"}
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

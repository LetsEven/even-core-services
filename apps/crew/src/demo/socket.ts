// Socket falso del modo demo: sin red. Entrega al hook useSocket los mismos
// eventos que mandaria el backend, a partir del store en memoria.
import type { CrewDevice } from "../hooks/useSocket";
import type { PrintJobData } from "../hooks/usePrinting";
import { DEMO_BRANCH_ID } from "./fixtures";
import { getDemoStore, type DemoEvent } from "./store";

export interface DemoSocketHandlers {
  onDevicesUpdated?: (devices: CrewDevice[], master: string | null) => void;
  onRefetch: () => void;
  onPrintJob?: (data: PrintJobData) => Promise<boolean>;
  onFlexbillOrder?: (data: {
    folio: string | null;
    orderedBy: string | null;
    identifier: string | null;
  }) => void;
}

export interface DemoSocket {
  emit: (event: string, payload?: { deviceId?: string }) => void;
  stop: () => void;
}

export function connectDemoSocket(
  { branchId, deviceId }: { branchId: string; deviceId: string },
  // Callbacks siempre actualizados (el hook los guarda en refs).
  handlers: () => DemoSocketHandlers,
): DemoSocket {
  const store = getDemoStore();
  console.info(`[DEMO:SOCKET] Socket simulado — branchId=${branchId} deviceId=${deviceId}`);
  let masterDeviceId: string | null = deviceId; // este dispositivo "imprime" (simulado)

  const devices = (): CrewDevice[] => [
    {
      deviceId,
      socketId: "demo-socket",
      connectedAt: new Date().toISOString(),
      online: true,
      platform: "native",
    },
  ];
  const announce = () => handlers().onDevicesUpdated?.(devices(), masterDeviceId);
  // Igual que "room:joined": ya con la lista de dispositivos y el master.
  const joinTimer = setTimeout(announce, 0);

  const unsubscribe = store.subscribe((e: DemoEvent) => {
    if (branchId !== DEMO_BRANCH_ID) return;
    if (e.name === "kitchen:print_job") {
      void handlers().onPrintJob?.(e.data as PrintJobData);
    } else if (e.name === "kitchen:notify") {
      handlers().onRefetch();
      const d = e.data as { orderType?: string; folio?: string | null; orderedBy?: string | null; identifier?: string | null };
      if (d.orderType === "flex_bill" && d.folio) {
        handlers().onFlexbillOrder?.({
          folio: d.folio,
          orderedBy: d.orderedBy ?? null,
          identifier: d.identifier ?? null,
        });
      }
    }
  });

  return {
    emit: (event, payload) => {
      if (event === "crew:set-master" && payload?.deviceId) {
        masterDeviceId = payload.deviceId;
        announce();
      }
    },
    stop: () => {
      clearTimeout(joinTimer);
      unsubscribe();
    },
  };
}

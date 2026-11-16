import { useContext, useEffect, useRef, useCallback } from "react";
import type { Socket } from "socket.io-client";
import type { DishStatus, Order } from "../types";
import type { PrintJobData } from "./usePrinting";
import { isTauri } from "../lib/platform";
import { isDemoMode } from "../lib/demoMode";
import type { DemoSocket } from "../demo/socket";
import { useAuth } from "../lib/auth";
import { LocalAuthContext } from "../lib/auth/localContext";
import { openCrewSocket } from "./crewSocket";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
// Fallback legado: solo se envia con provider clerk y si el build lo define
// (ver legacySecretFor). Sin valor por defecto.
const CREW_SECRET: string | undefined = import.meta.env.VITE_CREW_SOCKET_SECRET;

export interface CrewDevice {
  deviceId: string;
  socketId: string | null;
  connectedAt: string | null;
  online: boolean;
  // "web" = PWA/navegador (no imprime); ausente en backends viejos
  platform?: "web" | "native";
}

interface UseSocketProps {
  branchId: string | null;
  deviceId: string;
  onOrderClosed: (orderId: string) => void;
  onDishStatusChanged: (dishId: string, status: DishStatus) => void;
  onRefetch: () => void;
  onSilentRefetch?: () => void;
  onPrintJob?: (data: PrintJobData) => Promise<boolean>;
  onDevicesUpdated?: (
    devices: CrewDevice[],
    masterDeviceId: string | null,
  ) => void;
  onFlexbillOrder?: (data: {
    folio: string | null;
    orderedBy: string | null;
    identifier: string | null;
  }) => void;
  onTurnoClosed?: (data: {
    identifier: string | null;
    branchNumber: number | null;
  }) => void;
}

export function useSocket({
  branchId,
  deviceId,
  onOrderClosed,
  onDishStatusChanged,
  onRefetch,
  onSilentRefetch,
  onPrintJob,
  onDevicesUpdated,
  onFlexbillOrder,
  onTurnoClosed,
}: UseSocketProps) {
  // Refs para los callbacks — siempre actualizados, sin reconectar el socket
  const onOrderClosedRef = useRef(onOrderClosed);
  const onDishStatusChangedRef = useRef(onDishStatusChanged);
  const onRefetchRef = useRef(onRefetch);
  const onSilentRefetchRef = useRef(onSilentRefetch);
  const onPrintJobRef = useRef(onPrintJob);
  const onDevicesUpdatedRef = useRef(onDevicesUpdated);
  const onFlexbillOrderRef = useRef(onFlexbillOrder);
  const onTurnoClosedRef = useRef(onTurnoClosed);

  useEffect(() => {
    onOrderClosedRef.current = onOrderClosed;
  });
  useEffect(() => {
    onDishStatusChangedRef.current = onDishStatusChanged;
  });
  useEffect(() => {
    onRefetchRef.current = onRefetch;
  });
  useEffect(() => {
    onSilentRefetchRef.current = onSilentRefetch;
  });
  useEffect(() => {
    onPrintJobRef.current = onPrintJob;
  });
  useEffect(() => {
    onDevicesUpdatedRef.current = onDevicesUpdated;
  });
  useEffect(() => {
    onFlexbillOrderRef.current = onFlexbillOrder;
  });
  useEffect(() => {
    onTurnoClosedRef.current = onTurnoClosed;
  });

  const { kind, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });
  // Con provider local la sucursal del handshake es la del dispositivo emparejado.
  const localCtx = useContext(LocalAuthContext);
  const deviceBranchId = localCtx?.branchId ?? null;
  const handshakeBranchId = kind === "local" ? deviceBranchId : branchId;

  const socketRef = useRef<Socket | null>(null);
  // Modo demo: socket simulado sin red (ver src/demo/socket.ts)
  const demoSocketRef = useRef<DemoSocket | null>(null);

  // El socket se conecta/reconecta cuando cambia branchId
  useEffect(() => {
    console.log(
      `[CREW:SOCKET] Iniciando — branchId=${branchId} deviceId=${deviceId}`,
    );
    if (!branchId || !handshakeBranchId) {
      console.warn(
        "[CREW:SOCKET] No branchId configurado, socket no conectado",
      );
      return;
    }

    if (isDemoMode() || kind === "demo") {
      let cancelled = false;
      let stop = () => {};
      void import("../demo/socket").then(({ connectDemoSocket }) => {
        if (cancelled) return;
        const demoSocket = connectDemoSocket({ branchId, deviceId }, () => ({
          onDevicesUpdated: onDevicesUpdatedRef.current,
          onRefetch: () => onRefetchRef.current(),
          onPrintJob: onPrintJobRef.current,
          onFlexbillOrder: onFlexbillOrderRef.current,
        }));
        demoSocketRef.current = demoSocket;
        stop = demoSocket.stop;
      });
      return () => {
        cancelled = true;
        stop();
        demoSocketRef.current = null;
      };
    }

    console.log(`[CREW:SOCKET] Conectando a ${BASE_URL}`);
    const { socket, stop } = openCrewSocket({
      url: BASE_URL,
      branchId: handshakeBranchId,
      deviceId,
      platform: isTauri() ? "native" : "web",
      kind,
      getToken: () => getTokenRef.current(),
      legacySecret: CREW_SECRET,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log(`[CREW:SOCKET] Conectado — id=${socket.id}`);
    });

    socket.on("room:joined", (data: any) => {
      console.log(
        `[CREW:SOCKET] (ROOM) Sala unida — restaurant=${data?.restaurantId} branch=${data?.branchId} master=${data?.masterDeviceId}`,
      );
      if (data?.devices !== undefined) {
        onDevicesUpdatedRef.current?.(
          data.devices,
          data.masterDeviceId ?? null,
        );
      }
    });

    socket.on(
      "crew:devices-updated",
      ({
        devices,
        masterDeviceId,
      }: {
        devices: CrewDevice[];
        masterDeviceId: string | null;
      }) => {
        console.log(
          `[CREW:SOCKET] (PEOPLE) Dispositivos actualizados — count=${devices.length} master=${masterDeviceId}`,
        );
        onDevicesUpdatedRef.current?.(devices, masterDeviceId);
      },
    );

    socket.on("dashboard:new-transaction", (_data: unknown) => {
      // Notificación viene de kitchen:notify — aquí solo refrescamos silenciosamente
      onSilentRefetchRef.current?.();
    });

    socket.on(
      "dashboard:order-update",
      (data: { order: Order; action: string }) => {
        if (data.action === "closed") {
          onOrderClosedRef.current(data.order.id);
        } else if (data.action === "updated") {
          if (onSilentRefetchRef.current) {
            onSilentRefetchRef.current();
          } else {
            onRefetchRef.current();
          }
        }
      },
    );

    socket.on(
      "table:dish-status",
      (data: { dishId: string; status: DishStatus }) => {
        onDishStatusChangedRef.current(data.dishId, data.status);
      },
    );

    socket.on(
      "tappay:dish-status-changed",
      (data: { dishId: string; status: DishStatus }) => {
        onDishStatusChangedRef.current(data.dishId, data.status);
      },
    );

    socket.on(
      "kitchen:dish-status-changed",
      (data: { dishId: string; status: DishStatus }) => {
        onDishStatusChangedRef.current(data.dishId, data.status);
      },
    );

    socket.on(
      "kitchen:notify",
      (data: {
        wasFlowHeld?: boolean;
        orderType?: string;
        folio?: string | null;
        orderedBy?: string | null;
        identifier?: string | null;
        branchNumber?: number | null;
      }) => {
        console.log(
          `[CREW:SOCKET] (NOTIFICATION) kitchen:notify — wasFlowHeld=${data?.wasFlowHeld} orderType=${data?.orderType} folio=${data?.folio}`,
        );

        if (data?.orderType === "turno_closed") {
          onTurnoClosedRef.current?.({
            identifier: data.identifier ?? null,
            branchNumber: data.branchNumber ?? null,
          });
          return;
        }

        onRefetchRef.current();
        // For Flexbill: fire a direct per-user_order notification
        if (data?.orderType === "flex_bill" && data?.folio) {
          onFlexbillOrderRef.current?.({
            folio: data.folio,
            orderedBy: data.orderedBy ?? null,
            identifier: data.identifier ?? null,
          });
        }
      },
    );

    socket.on("kitchen:print_job", async (data: PrintJobData) => {
      console.log(
        `[CREW:SOCKET] (PRINT) kitchen:print_job recibido — branchId=${data.branchId} identifier=${data.orderInfo?.identifier} items=${data.items?.length} jobId=${data.jobId}`,
      );
      try {
        // Solo ackear si este dispositivo de verdad intentó imprimir — antes
        // se mandaba el ack aunque printJob se saltara todo en silencio (no
        // era Master, branch no coincidía, o no había impresoras cargadas),
        // y el backend quedaba creyendo que el pedido se había impreso.
        const printed = await onPrintJobRef.current?.(data);
        if (data.jobId && printed) {
          socket.emit("print_job_ack", { jobId: data.jobId });
          console.log(
            `[CREW:SOCKET] print_job_ack enviado — jobId=${data.jobId}`,
          );
        }
      } catch (e) {
        console.error("[CREW:SOCKET] Error en print_job:", e);
      }
    });

    socket.on("connect_error", (err) => {
      console.error(`[CREW:SOCKET] Error de conexión: ${err.message}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[CREW:SOCKET] Desconectado — reason=${reason}`);
    });

    socket.on("reconnect", (attempt: number) => {
      console.log(`[CREW:SOCKET] Reconectado tras ${attempt} intento(s)`);
    });

    return () => {
      console.log("[CREW:SOCKET] Cleanup — desconectando socket");
      stop();
      socketRef.current = null;
    };
  }, [branchId, handshakeBranchId, deviceId, kind]); // reconecta si cambia la sucursal

  const setMaster = useCallback((targetDeviceId: string) => {
    if (demoSocketRef.current) {
      demoSocketRef.current.emit("crew:set-master", { deviceId: targetDeviceId });
      return;
    }
    socketRef.current?.emit("crew:set-master", { deviceId: targetDeviceId });
  }, []);

  return { setMaster };
}

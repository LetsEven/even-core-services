import type { CrewDevice } from "../../hooks/useSocket";
import { bridgeCanPrint, type BridgeStatus } from "./bridgeStatus";

export type PrintingStatus =
  | { kind: "bridge" }
  | { kind: "este-equipo" }
  | { kind: "otro-equipo" }
  | {
      kind: "nadie";
      reason: "sin-dispositivo" | "dispositivo-web" | "dispositivo-offline";
      /** Este dispositivo puede activarse (es app nativa, no web). */
      canActivateHere: boolean;
    };

interface Input {
  deviceId: string;
  masterDeviceId: string | null;
  connectedDevices: CrewDevice[];
  /** true si este dispositivo es la app nativa (Tauri). */
  canPrint: boolean;
  bridge: BridgeStatus;
}

/** Decide quién imprime los tickets. Lógica pura, sin React. */
export function getPrintingStatus({
  deviceId,
  masterDeviceId,
  connectedDevices,
  canPrint,
  bridge,
}: Input): PrintingStatus {
  if (bridgeCanPrint(bridge)) return { kind: "bridge" };

  if (!masterDeviceId) {
    return { kind: "nadie", reason: "sin-dispositivo", canActivateHere: canPrint };
  }
  if (masterDeviceId === deviceId) {
    return canPrint
      ? { kind: "este-equipo" }
      : { kind: "nadie", reason: "dispositivo-web", canActivateHere: false };
  }
  const other = connectedDevices.find((d) => d.deviceId === masterDeviceId);
  if (other?.platform === "web") {
    return { kind: "nadie", reason: "dispositivo-web", canActivateHere: canPrint };
  }
  if (!other || !other.online) {
    return {
      kind: "nadie",
      reason: "dispositivo-offline",
      canActivateHere: canPrint,
    };
  }
  return { kind: "otro-equipo" };
}

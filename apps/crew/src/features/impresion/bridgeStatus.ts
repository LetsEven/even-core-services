// Estado del bridge de impresión (Raspberry Pi, even-bridge).
//
// STUB: el bridge aún no está integrado en Crew y el backend todavía no
// expone su estado. Mientras tanto `useBridgeStatus()` siempre devuelve
// "desconocido" y el banner lo trata como "sin bridge". No hay endpoint
// inventado aquí: cuando el backend publique el estado (REST o evento de
// socket), conéctalo dentro de `useBridgeStatus` sin cambiar a quienes lo usan.

export type BridgeState = "desconocido" | "conectado" | "desconectado";

export interface BridgeStatus {
  state: BridgeState;
  /** Última vez que el bridge reportó actividad (ISO), si el backend la da. */
  lastSeenAt: string | null;
}

export const BRIDGE_STATUS_UNKNOWN: BridgeStatus = {
  state: "desconocido",
  lastSeenAt: null,
};

/** true solo si sabemos que hay un bridge listo para imprimir. */
export function bridgeCanPrint(bridge: BridgeStatus): boolean {
  return bridge.state === "conectado";
}

export function useBridgeStatus(): BridgeStatus {
  return BRIDGE_STATUS_UNKNOWN;
}

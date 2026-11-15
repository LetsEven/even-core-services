// Sesión de mesero por dispositivo, persistida por sucursal. A diferencia
// del viejo waiterLogin.ts (commit bede8c0), no hay estado "declinado" —
// seguir como invitado no se guarda, así que el modal de login puede volver
// a aparecer en la próxima carga de la app (ver useWaiterSession).

export interface WaiterSession {
  id: string;
  name: string;
}

function key(branchId: string): string {
  return `crew_waiter_session_${branchId}`;
}

export function getWaiterSession(branchId: string): WaiterSession | null {
  try {
    const raw = localStorage.getItem(key(branchId));
    if (!raw) return null;
    return JSON.parse(raw) as WaiterSession;
  } catch {
    return null;
  }
}

export function setWaiterSession(branchId: string, waiter: WaiterSession): void {
  try {
    localStorage.setItem(key(branchId), JSON.stringify(waiter));
  } catch {
    // silently fail
  }
}

export function clearWaiterSession(branchId: string): void {
  try {
    localStorage.removeItem(key(branchId));
  } catch {
    // silently fail
  }
}

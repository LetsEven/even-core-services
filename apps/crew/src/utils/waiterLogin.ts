// Set de meseros autenticados (PIN verificado) en este dispositivo, por
// sucursal. No hay "un mesero logueado" — cualquier mesero de la lista se
// puede elegir por orden, y una vez que se valida su PIN una vez en este
// device, queda recordado para las próximas veces (ver WaiterPinModal).

function key(branchId: string): string {
  return `crew_authenticated_waiters_${branchId}`;
}

function getAuthenticatedWaiterIds(branchId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(branchId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function isWaiterAuthenticated(
  branchId: string,
  waiterId: string,
): boolean {
  return getAuthenticatedWaiterIds(branchId).has(waiterId);
}

export function markWaiterAuthenticated(
  branchId: string,
  waiterId: string,
): void {
  const ids = getAuthenticatedWaiterIds(branchId);
  ids.add(waiterId);
  try {
    localStorage.setItem(key(branchId), JSON.stringify([...ids]));
  } catch {
    // silently fail
  }
}

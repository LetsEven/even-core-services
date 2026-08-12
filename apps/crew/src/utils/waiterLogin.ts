// Identidad de mesero logueado en este dispositivo, por sucursal.
// - Ausente (localStorage.getItem === null): nunca se preguntó en esta
//   sucursal/dispositivo -> hay que mostrar el gate.
// - {id: null, name: null}: se preguntó y el staff eligió "Continuar sin
//   mesero" -> no volver a preguntar, pero tampoco hay mesero logueado.
// - {id, name}: mesero logueado.
export interface LoggedWaiter {
  id: string | null;
  name: string | null;
}

function key(branchId: string): string {
  return `crew_waiter_${branchId}`;
}

export function getLoggedWaiter(branchId: string): LoggedWaiter | null {
  const raw = localStorage.getItem(key(branchId));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as LoggedWaiter;
  } catch {
    return null;
  }
}

export function setLoggedWaiter(branchId: string, waiter: LoggedWaiter): void {
  localStorage.setItem(key(branchId), JSON.stringify(waiter));
}

export function clearLoggedWaiter(branchId: string): void {
  localStorage.removeItem(key(branchId));
}

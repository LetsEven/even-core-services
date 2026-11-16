import type { Branch } from "../../services/api";

// Alcance de sucursal en modo local (crew-auth): el dispositivo se empareja a
// UNA sucursal y un usuario que no es super no puede salir de ella. El super
// puede cambiar, pero solo entre sucursales de su restaurante (el de la
// sucursal del dispositivo). Sin la sucursal del dispositivo en la lista no
// hay nada verificable: no se ofrece ningun cambio.

export function scopeBranches(
  list: Branch[],
  deviceBranchId: string | null,
  isSuper: boolean,
): Branch[] {
  const device = list.find((b) => b.id === deviceBranchId);
  if (!device) return [];
  if (!isSuper) return [device];
  return list.filter((b) => b.restaurant_id === device.restaurant_id);
}

/** Primera preferencia permitida; si no, la sucursal del dispositivo. */
export function pickLocalBranch(
  allowed: Branch[],
  deviceBranchId: string | null,
  ...preferred: (string | null | undefined)[]
): string | null {
  for (const id of preferred) {
    if (id && allowed.some((b) => b.id === id)) return id;
  }
  return deviceBranchId;
}

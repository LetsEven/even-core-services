import { Armchair, ChefHat, Receipt, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ROUTE_PERMISSIONS, type Permission } from "../lib/auth/roles";
import { useAuth } from "../lib/auth";

export interface NavDestination {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { to: "/mesas", label: "Mesas", icon: Armchair, permission: ROUTE_PERMISSIONS["/mesas"] },
  { to: "/cocina", label: "Cocina", icon: ChefHat, permission: ROUTE_PERMISSIONS["/cocina"] },
  { to: "/caja", label: "Caja", icon: Receipt, permission: ROUTE_PERMISSIONS["/caja"] },
  { to: "/ajustes", label: "Ajustes", icon: Settings, permission: ROUTE_PERMISSIONS["/ajustes"] },
];

/** Destinos de navegacion que el usuario actual puede ver. */
export function useNavDestinations(): NavDestination[] {
  const { hasPermission } = useAuth();
  return NAV_DESTINATIONS.filter((d) => hasPermission(d.permission));
}

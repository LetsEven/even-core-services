import { Armchair, ChefHat, Receipt, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavDestination {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { to: "/mesas", label: "Mesas", icon: Armchair },
  { to: "/cocina", label: "Cocina", icon: ChefHat },
  { to: "/caja", label: "Caja", icon: Receipt },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
];

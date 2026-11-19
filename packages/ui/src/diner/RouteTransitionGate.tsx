"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { notifyRouteChanged, recordFlowPath } from "../lib/route-transition";

/**
 * Avisa a la transición de vistas que la ruta nueva ya se montó y la registra en el historial del flujo
 * (para saber cuál es la vista anterior al volver). Lo monta `FlowTransitionProvider`.
 */
export default function RouteTransitionGate() {
  const pathname = usePathname();
  useEffect(() => {
    recordFlowPath(pathname);
    notifyRouteChanged();
  }, [pathname]);
  return null;
}

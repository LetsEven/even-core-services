"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { notifyRouteChanged } from "@even/ui";

/** Avisa a la transición de vistas que la ruta nueva ya se montó. */
export default function RouteTransitionGate() {
  const pathname = usePathname();
  useEffect(() => {
    notifyRouteChanged();
  }, [pathname]);
  return null;
}

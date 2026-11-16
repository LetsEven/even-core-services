import { createContext, useContext, useEffect, useRef } from "react";

// Cada página registra aquí su "Actualizar" para que el botón de la TopBar
// refresque lo que se está viendo (órdenes, mesas, historial...).
export interface RefreshRegistry {
  register: (fn: (() => void) | null, busy: boolean) => void;
}

export const RefreshContext = createContext<RefreshRegistry | null>(null);

export function useRegisterRefresh(fn: () => void, busy: boolean) {
  const registry = useContext(RefreshContext);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!registry) return;
    registry.register(() => fnRef.current(), busy);
    return () => registry.register(null, false);
  }, [registry, busy]);
}

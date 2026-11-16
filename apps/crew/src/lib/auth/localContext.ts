import { createContext, useContext } from "react";
import type { LocalClient, SelectorUser } from "./localClient";
import type { LocalSnapshot } from "./localSession";

/** Extras del adaptador local: emparejamiento, selector y login con PIN. */
export interface LocalAuthExtras {
  paired: boolean;
  branchId: string | null;
  client: LocalClient;
  pair: (code: string) => Promise<void>;
  unpair: () => void;
  listUsers: () => Promise<SelectorUser[]>;
  login: (userId: string, pin: string) => Promise<void>;
  /** Estado crudo de la sesion (para pantallas de login). */
  snapshot: LocalSnapshot;
}

export const LocalAuthContext = createContext<LocalAuthExtras | null>(null);

export function useLocalAuth(): LocalAuthExtras {
  const ctx = useContext(LocalAuthContext);
  if (!ctx) throw new Error("useLocalAuth requiere el proveedor de auth local");
  return ctx;
}

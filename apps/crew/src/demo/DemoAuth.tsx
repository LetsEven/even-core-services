import { useCallback, useMemo, useState, type ReactNode } from "react";
import { DemoAuthContext, type DemoAuthValue } from "../lib/auth";

const KEY = "crew_demo_signed_in";

function readSigned(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function writeSigned(v: boolean) {
  try {
    if (v) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* sin storage: la sesion demo dura lo que dure la pagina */
  }
}

// Sustituye a ClerkProvider en modo demo: sesion falsa, sin red.
export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setSigned] = useState(readSigned);

  const signIn = useCallback(() => {
    writeSigned(true);
    setSigned(true);
  }, []);
  const signOut = useCallback(() => {
    writeSigned(false);
    setSigned(false);
  }, []);

  const value = useMemo<DemoAuthValue>(
    () => ({ isSignedIn, signIn, signOut }),
    [isSignedIn, signIn, signOut],
  );

  return (
    <DemoAuthContext.Provider value={value}>
      {children}
    </DemoAuthContext.Provider>
  );
}

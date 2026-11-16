import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AuthContext } from "../lib/auth/context";
import { permissionsForRole } from "../lib/auth/roles";
import type { AuthProvider, AuthUser } from "../lib/auth/types";
import { DEMO_TOKEN, DemoAuthContext, type DemoAuthValue } from "./demoAuthContext";

const KEY = "crew_demo_signed_in";

// Usuario del modo demo: super (todo accesible).
const DEMO_USER: AuthUser = {
  id: "demo-user",
  name: "Demo Even",
  role: "super",
  permissions: permissionsForRole("super"),
};

// Estable entre renders: los efectos de la app lo usan como dependencia.
const demoGetToken = async (): Promise<string | null> => DEMO_TOKEN;
const demoHasPermission: AuthProvider["hasPermission"] = (p) =>
  DEMO_USER.permissions.includes(p);

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

  const controls = useMemo<DemoAuthValue>(
    () => ({ isSignedIn, signIn, signOut }),
    [isSignedIn, signIn, signOut],
  );

  const auth = useMemo<AuthProvider>(
    () => ({
      kind: "demo",
      status: isSignedIn ? "signedIn" : "signedOut",
      user: isSignedIn ? DEMO_USER : null,
      getToken: demoGetToken,
      signOut: async () => signOut(),
      hasPermission: isSignedIn ? demoHasPermission : () => false,
    }),
    [isSignedIn, signOut],
  );

  return (
    <AuthContext.Provider value={auth}>
      <DemoAuthContext.Provider value={controls}>
        {children}
      </DemoAuthContext.Provider>
    </AuthContext.Provider>
  );
}

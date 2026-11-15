import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AuthContext, makeHasPermission } from "./context";
import { createLocalClient } from "./localClient";
import { LocalAuthContext, type LocalAuthExtras } from "./localContext";
import { createLocalAuth } from "./localSession";
import type { AuthProvider } from "./types";

// Adaptador "local": servicio crew-auth (dispositivo emparejado + usuario con
// PIN). Se carga con import() solo si VITE_AUTH_PROVIDER=local.
export function LocalAuthProvider({
  baseUrl,
  children,
}: {
  baseUrl: string;
  children: ReactNode;
}) {
  const [{ controller, client }] = useState(() => {
    const c = createLocalClient({ baseUrl });
    return { client: c, controller: createLocalAuth({ client: c }) };
  });
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.start();
    return () => controller.stop();
  }, [controller]);

  const auth = useMemo<AuthProvider>(
    () => ({
      kind: "local",
      status: snapshot.status,
      user: snapshot.user,
      getToken: controller.getToken,
      signOut: controller.signOut,
      hasPermission: makeHasPermission(snapshot.user),
    }),
    [snapshot.status, snapshot.user, controller],
  );

  const extras = useMemo<LocalAuthExtras>(
    () => ({
      paired: snapshot.paired,
      branchId: snapshot.branchId,
      client,
      pair: controller.pair,
      unpair: controller.unpair,
      listUsers: controller.listUsers,
      login: controller.login,
      snapshot,
    }),
    [snapshot, client, controller],
  );

  return (
    <AuthContext.Provider value={auth}>
      <LocalAuthContext.Provider value={extras}>
        {children}
      </LocalAuthContext.Provider>
    </AuthContext.Provider>
  );
}

import { useCallback, useMemo, type ReactNode } from "react";
import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useUser,
} from "@clerk/clerk-react";
import { createNativeClerk } from "../clerkNative";
import { isTauri } from "../platform";
import { AuthContext, makeHasPermission } from "./context";
import { permissionsForRole, roleFromClerkMetadata } from "./roles";
import type { AuthProvider, AuthUser } from "./types";

// Adaptador "clerk": envuelve lo que antes hacia src/lib/auth.ts (token JWT de
// Clerk, cierre de sesion) y le suma usuario y rol. El rol sale de
// publicMetadata.crewRole; sin valor es `super` para no romper cuentas actuales.
function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { isLoaded: userLoaded, user: clerkUser } = useUser();

  const user = useMemo<AuthUser | null>(() => {
    if (!isSignedIn || !clerkUser) return null;
    const role = roleFromClerkMetadata(clerkUser.publicMetadata);
    return {
      id: clerkUser.id,
      name:
        clerkUser.fullName ??
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.id,
      role,
      permissions: permissionsForRole(role),
    };
  }, [isSignedIn, clerkUser]);

  const doSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const auth = useMemo<AuthProvider>(() => {
    // Con sesion, no se declara "signedIn" hasta conocer al usuario (y su rol).
    const status = !isLoaded || (isSignedIn && !userLoaded)
      ? "loading"
      : isSignedIn
        ? "signedIn"
        : "signedOut";
    return {
      kind: "clerk",
      status,
      user,
      getToken: () => getToken(),
      signOut: doSignOut,
      hasPermission: makeHasPermission(user),
    };
  }, [isLoaded, isSignedIn, userLoaded, user, getToken, doSignOut]);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function ClerkAuthProvider({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  // Una sola instancia por montaje.
  const clerk = useMemo(() => createNativeClerk(publishableKey), [publishableKey]);
  return (
    <ClerkProvider
      Clerk={clerk}
      publishableKey={publishableKey}
      standardBrowser={!isTauri()}
    >
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}

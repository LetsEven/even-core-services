import { createContext, useCallback, useContext } from "react";
import {
  useAuth as useClerkAuth,
  useClerk as useClerkClerk,
  useSignIn as useClerkSignIn,
} from "@clerk/clerk-react";
import { isDemoMode } from "./demoMode";

// Unico punto de contacto con @clerk/clerk-react. En modo normal delega en
// Clerk tal cual; en modo demo (ver src/demo) devuelve una sesion falsa.
// La eleccion es constante en tiempo de build, asi que el orden de hooks
// nunca cambia entre renders.

export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  getToken: () => Promise<string | null>;
}

export interface DemoAuthValue {
  isSignedIn: boolean;
  signIn: () => void;
  signOut: () => void;
}

export const DemoAuthContext = createContext<DemoAuthValue | null>(null);

export const DEMO_TOKEN = "demo-token";
export const DEMO_USER = { id: "demo-user", name: "Demo Even" } as const;

// Estable entre renders: los efectos de la app lo usan como dependencia.
const demoGetToken = async (): Promise<string | null> => DEMO_TOKEN;

function useDemoContext(): DemoAuthValue {
  const ctx = useContext(DemoAuthContext);
  if (!ctx) throw new Error("Modo demo: falta DemoAuthProvider");
  return ctx;
}

function useDemoAuth(): AuthState {
  const { isSignedIn } = useDemoContext();
  return { isLoaded: true, isSignedIn, getToken: demoGetToken };
}

function useRealAuth(): AuthState {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  return { isLoaded, isSignedIn, getToken };
}

/** isLoaded / isSignedIn / getToken (JWT de Clerk, o token falso en demo). */
export const useAuth: () => AuthState = isDemoMode() ? useDemoAuth : useRealAuth;

function useDemoSignOut(): () => void {
  return useDemoContext().signOut;
}

function useRealSignOut(): () => void {
  const { signOut } = useClerkClerk();
  return useCallback(() => {
    void signOut();
  }, [signOut]);
}

/** Cierra la sesion (Clerk o demo). */
export const useSignOut: () => () => void = isDemoMode()
  ? useDemoSignOut
  : useRealSignOut;

/** Formulario de login de Clerk (no usar en demo: ahi se usa DemoLogin). */
export function useClerkSignInForm() {
  return useClerkSignIn();
}

import { createContext } from "react";

export interface DemoAuthValue {
  isSignedIn: boolean;
  signIn: () => void;
  signOut: () => void;
}

export const DemoAuthContext = createContext<DemoAuthValue | null>(null);

export const DEMO_TOKEN = "demo-token";

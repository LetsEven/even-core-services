import { evaluateDemoMode, type DemoModeEnv } from "../demoMode";
import type { AuthKind } from "./types";

export interface AuthEnv extends DemoModeEnv {
  VITE_AUTH_PROVIDER?: string;
  VITE_CREW_AUTH_URL?: string;
}

const KINDS: readonly AuthKind[] = ["clerk", "local", "demo"];

/**
 * Adaptador de auth segun el build. `VITE_DEMO_MODE=true` fuerza demo, y
 * `VITE_AUTH_PROVIDER=demo` pide lo mismo (con las mismas salvaguardas: si el
 * modo demo se niega por API de produccion, tampoco cae a otro adaptador y main
 * muestra la pantalla de rechazo). Sin variable, clerk. Un valor desconocido
 * es un error de configuracion, no se adivina.
 */
export function resolveAuthProvider(env: AuthEnv): AuthKind {
  const demo = evaluateDemoMode(env);
  if (demo.active || demo.error) return "demo";
  const raw = (env.VITE_AUTH_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "") return "clerk";
  if ((KINDS as readonly string[]).includes(raw)) return raw as AuthKind;
  throw new Error(
    `VITE_AUTH_PROVIDER invalido: "${env.VITE_AUTH_PROVIDER}". Usa clerk, local o demo.`,
  );
}

// Modo demo: solo para revisar la UI en el despliegue dev, sin backend ni Clerk.
// Se activa unicamente con VITE_DEMO_MODE=true (build-time) y se niega si la
// API configurada es de produccion. Este archivo es chico a proposito: el
// resto del codigo demo vive en src/demo/** y se carga con import dinamico.

// Hosts que nunca deben convivir con el modo demo (coincidencia por substring
// del VITE_API_BASE_URL, en minusculas).
export const PRODUCTION_API_HOSTS = [
  "api.letseven.io",
  "even-backend-production",
] as const;

export interface DemoModeEnv {
  VITE_DEMO_MODE?: string;
  VITE_API_BASE_URL?: string;
}

export interface DemoModeStatus {
  /** El modo demo esta activo y permitido. */
  active: boolean;
  /** Si se pidio el modo demo pero se nego, el motivo (en espanol). */
  error: string | null;
}

export function evaluateDemoMode(env: DemoModeEnv): DemoModeStatus {
  if (env.VITE_DEMO_MODE !== "true") return { active: false, error: null };

  const apiUrl = (env.VITE_API_BASE_URL ?? "").trim().toLowerCase();
  const prodHost = PRODUCTION_API_HOSTS.find((h) => apiUrl.includes(h));
  if (prodHost) {
    return {
      active: false,
      error:
        `MODO DEMO rechazado: VITE_API_BASE_URL apunta a produccion (${prodHost}). ` +
        "El modo demo solo puede construirse para dev, sin la API de produccion. " +
        "Quita VITE_DEMO_MODE o cambia VITE_API_BASE_URL.",
    };
  }
  return { active: true, error: null };
}

export const demoStatus: DemoModeStatus = evaluateDemoMode(
  import.meta.env as DemoModeEnv,
);

export const isDemoMode = (): boolean => demoStatus.active;

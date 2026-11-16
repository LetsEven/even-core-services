/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_LABEL: string;
  readonly VITE_ENABLE_REPRINT?: string;
  /** "true" activa el modo demo (solo dev; se niega con API de produccion). */
  readonly VITE_DEMO_MODE?: string;
  /** "clerk" (default) | "local" (servicio crew-auth) | "demo". */
  readonly VITE_AUTH_PROVIDER?: string;
  /** URL base del servicio crew-auth (obligatoria con VITE_AUTH_PROVIDER=local). */
  readonly VITE_CREW_AUTH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

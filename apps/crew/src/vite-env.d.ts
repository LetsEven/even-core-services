/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_LABEL: string;
  readonly VITE_ENABLE_REPRINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

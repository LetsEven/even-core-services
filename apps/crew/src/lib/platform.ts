import { isDemoMode } from "./demoMode";

// true dentro de la app de Tauri (Windows/Android); false en navegador o PWA
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isWeb = () => !isTauri();

// Este dispositivo puede imprimir: la app nativa, o el modo demo (impresion
// simulada). Fuera de demo es exactamente isTauri().
export const canPrintHere = () => isTauri() || isDemoMode();

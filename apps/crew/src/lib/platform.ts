// true dentro de la app de Tauri (Windows/Android); false en navegador o PWA
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isWeb = () => !isTauri();

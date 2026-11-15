import { installDemoFetch } from "./fetch";

// Punto de entrada del modo demo (se carga con import dinamico desde main.tsx):
// intercepta toda la API con fixtures en memoria. Auth, socket e impresion se
// enganchan aparte (lib/auth, hooks/useSocket, lib/native).
export function installDemo(): void {
  installDemoFetch();
  console.warn("[DEMO] Modo demo activo: datos ficticios, sin backend ni Clerk.");
}

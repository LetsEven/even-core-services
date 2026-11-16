import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { demoStatus } from "./lib/demoMode";
import { resolveAuthProvider } from "./lib/auth/select";
import { isTauri } from "./lib/platform";

const root = createRoot(document.getElementById("root")!);

// Service worker solo en web (PWA instalable); en Tauri no hace falta. En demo
// no se registra: no hay push ni nada que cachear.
function registerServiceWorker() {
  if (!isTauri() && import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[PWA] No se pudo registrar el service worker:", err);
      });
    });
  }
}

async function startDemo() {
  // VITE_DEMO_MODE=true con API de produccion: se niega y no monta la app.
  if (demoStatus.error) {
    console.error(`[DEMO] ${demoStatus.error}`);
    const { default: RefusalScreen } = await import("./demo/RefusalScreen");
    root.render(<RefusalScreen message={demoStatus.error} />);
    return;
  }

  // Modo demo: sin Clerk ni backend. Todo el codigo demo se carga aqui y solo
  // aqui (import dinamico), asi el bundle normal no lo incluye.
  const { installDemo } = await import("./demo/install");
  const { DemoAuthProvider } = await import("./demo/DemoAuth");
  installDemo();
  root.render(
    <DemoAuthProvider>
      <App />
    </DemoAuthProvider>,
  );
}

async function startClerk() {
  const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  if (!PUBLISHABLE_KEY) {
    throw new Error("VITE_CLERK_PUBLISHABLE_KEY no configurado");
  }

  const { ClerkAuthProvider } = await import("./lib/auth/clerk");
  registerServiceWorker();

  root.render(
    <ClerkAuthProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkAuthProvider>,
  );
}

// Servicio crew-auth propio: dispositivo emparejado + usuario con PIN. No usa
// Clerk (su codigo ni se descarga).
async function startLocal() {
  const baseUrl = import.meta.env.VITE_CREW_AUTH_URL;
  if (!baseUrl) {
    throw new Error("VITE_CREW_AUTH_URL no configurado (VITE_AUTH_PROVIDER=local)");
  }

  const { LocalAuthProvider } = await import("./lib/auth/local");
  registerServiceWorker();

  root.render(
    <LocalAuthProvider baseUrl={baseUrl}>
      <App />
    </LocalAuthProvider>,
  );
}

const kind = resolveAuthProvider(import.meta.env);
if (kind === "demo") void startDemo();
else if (kind === "local") void startLocal();
else void startClerk();

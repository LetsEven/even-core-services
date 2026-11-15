import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import App from "./App.tsx";
import { createNativeClerk } from "./lib/clerkNative";
import { demoStatus } from "./lib/demoMode";
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

function startNormal() {
  const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  if (!PUBLISHABLE_KEY) {
    throw new Error("VITE_CLERK_PUBLISHABLE_KEY no configurado");
  }

  const clerk = createNativeClerk(PUBLISHABLE_KEY);
  registerServiceWorker();

  root.render(
    <ClerkProvider Clerk={clerk} publishableKey={PUBLISHABLE_KEY} standardBrowser={!isTauri()}>
      <App />
    </ClerkProvider>,
  );
}

if (demoStatus.active || demoStatus.error) void startDemo();
else startNormal();

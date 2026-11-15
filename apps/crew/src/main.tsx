import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import App from "./App.tsx";
import { createNativeClerk } from "./lib/clerkNative";
import { isTauri } from "./lib/platform";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY no configurado");
}

const clerk = createNativeClerk(PUBLISHABLE_KEY);

// Service worker solo en web (PWA instalable); en Tauri no hace falta
if (!isTauri() && import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[PWA] No se pudo registrar el service worker:", err);
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <ClerkProvider Clerk={clerk} publishableKey={PUBLISHABLE_KEY} standardBrowser={!isTauri()}>
    <App />
  </ClerkProvider>
);

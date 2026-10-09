import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import App from "./App.tsx";
import { createNativeClerk } from "./lib/clerkNative";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY no configurado");
}

const clerk = createNativeClerk(PUBLISHABLE_KEY);

createRoot(document.getElementById("root")!).render(
  <ClerkProvider Clerk={clerk} publishableKey={PUBLISHABLE_KEY} standardBrowser={false}>
    <App />
  </ClerkProvider>
);

import { lazy, Suspense } from "react";
import { useAuth } from "../lib/auth";

// Cada pantalla se carga solo si su adaptador esta activo: el build de un
// adaptador no descarga el codigo de los otros.
const DemoLogin = lazy(() => import("../demo/DemoLogin"));
const ClerkLoginForm = lazy(() => import("./login/ClerkLoginForm"));
const LocalLogin = lazy(() => import("./login/LocalLogin"));

export default function LoginPage() {
  const { kind } = useAuth();
  return (
    <Suspense fallback={null}>
      {kind === "demo" ? (
        <DemoLogin />
      ) : kind === "local" ? (
        <LocalLogin />
      ) : (
        <ClerkLoginForm />
      )}
    </Suspense>
  );
}

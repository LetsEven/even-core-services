import { useContext } from "react";
import { DemoAuthContext } from "../lib/auth";
import DemoBanner from "./DemoBanner";

const APP_LABEL = import.meta.env.VITE_APP_LABEL || "Even Crew";

// Reemplaza el login de Clerk en modo demo. El guard del router detecta la
// sesion falsa y redirige a "/".
export default function DemoLogin() {
  const auth = useContext(DemoAuthContext);
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#023828" }}>
      <DemoBanner />
      <div className="flex-1 flex flex-col justify-center items-center px-6">
        <div className="w-full max-w-sm flex flex-col items-center">
          <div className="mb-8 flex flex-col items-center gap-3">
            <img
              src="/even/even-asterisk-grass.svg"
              alt="Even"
              className="w-16 h-16"
            />
            <h1 className="text-even-offwhite text-2xl font-medium uppercase tracking-widest">
              {APP_LABEL}
            </h1>
            <p className="text-even-offwhite/60 text-xs uppercase tracking-widest text-center">
              Mariscos Mazatlán · datos ficticios, sin backend
            </p>
          </div>
          <button
            type="button"
            onClick={() => auth?.signIn()}
            className="w-full py-3 rounded-md text-even-evergreen font-medium text-sm uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
            style={{ background: "#82E657" }}
          >
            Entrar al modo demo
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { Check, Loader2, User, ArrowLeft } from "lucide-react";
import { verifyWaiterPassword } from "../services/api";
import type { WaiterSession } from "../utils/waiterSession";

interface Props {
  branchId: string;
  availableWaiters: WaiterSession[];
  allowGuest: boolean;
  onResolved: (waiter: WaiterSession | null) => void;
}

// Modal de login de mesero por dispositivo — adaptado de WaiterLoginScreen.tsx
// (pantalla completa, commit bede8c0, eliminado en fe17dfa) pero como overlay,
// no bloqueando el resto de la app. `allowGuest=false` lo usa
// useWaiterSession().requireLogin cuando una acción puntual necesita
// identidad sí o sí (no se puede cerrar sin elegir mesero + PIN).
export default function WaiterLoginModal({
  branchId,
  availableWaiters,
  allowGuest,
  onResolved,
}: Props) {
  const { getToken } = useAuth();
  // Filtra tanto el "EVEN" sintético (id) como cualquier mesero real
  // sincronizado de Soft Restaurant que se llame literalmente EVEN — no es
  // una identidad válida para iniciar sesión, ya está el botón de invitado.
  const realWaiters = availableWaiters.filter(
    (w) => w.id !== "EVEN" && w.name.trim().toUpperCase() !== "EVEN",
  );

  const [selected, setSelected] = useState<WaiterSession | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No requerimos password.length > 0: algunos meseros tienen contraseña
  // vacía en Soft Restaurant, así que un campo vacío es un intento válido.
  async function handleConfirm() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No autenticado");
      const ok = await verifyWaiterPassword(
        branchId,
        selected.id,
        password,
        token,
      );
      if (ok) {
        onResolved(selected);
        return;
      }
      setError("Contraseña incorrecta");
    } catch {
      setError("Error al verificar. Intenta de nuevo.");
    } finally {
      // No dejar la contraseña en memoria más de lo necesario.
      setPassword("");
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-white/8 px-4 py-3 text-sm text-even-offwhite/80 placeholder-white/20 focus:outline-none focus:border-white/20";
  const inputStyle = { background: "rgba(255,255,255,0.04)" };

  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (allowGuest && e.target === e.currentTarget) onResolved(null);
      }}
    >
      <div
        className="w-full max-w-sm rounded-lg overflow-hidden border border-white/10 shadow-2xl px-6 py-6 flex flex-col items-center"
        style={{ background: "#023828" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex flex-col items-center gap-3">
          <img
            src="/even/even-asterisk-grass.svg"
            alt="Even"
            className="w-12 h-12"
          />
          <h1 className="text-even-offwhite text-lg font-medium uppercase tracking-widest text-center">
            {selected ? "Ingresa tu contraseña" : "¿Quién eres?"}
          </h1>
          <p className="text-even-offwhite/60 text-xs uppercase tracking-widest text-center">
            {selected ? selected.name : "Selecciona tu nombre de mesero"}
          </p>
        </div>

        {!selected ? (
          <div className="w-full flex flex-col gap-3">
            <div
              className="w-full rounded-lg border border-white/8 overflow-hidden max-h-64 overflow-y-auto no-scrollbar"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              {realWaiters.map((w, idx) => (
                <button
                  key={w.id}
                  onClick={() => setSelected(w)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors cursor-pointer ${
                    idx > 0 ? "border-t border-white/8" : ""
                  } hover:bg-white/5`}
                >
                  <User className="w-4 h-4 text-even-offwhite/40 shrink-0" />
                  <span className="text-sm font-medium text-even-offwhite/80">
                    {w.name}
                  </span>
                </button>
              ))}
            </div>

            {allowGuest && (
              <button
                onClick={() => onResolved(null)}
                className="w-full py-3 rounded-md border border-white/15 text-even-offwhite/60 text-xs font-medium uppercase tracking-wider hover:bg-white/5 transition-colors cursor-pointer"
              >
                Continuar como invitado
              </button>
            )}
          </div>
        ) : (
          <div className="w-full flex flex-col gap-3">
            <input
              type="password"
              inputMode="numeric"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
              placeholder="Contraseña"
              autoFocus
              className={inputClass}
              style={inputStyle}
            />

            {error && (
              <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-400/20 rounded-lg px-4 py-3 text-center">
                {error}
              </p>
            )}

            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-even-grass hover:bg-even-grass/90 text-even-evergreen text-xs font-medium uppercase tracking-wider disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {submitting ? "Verificando..." : "Confirmar"}
            </button>

            <button
              onClick={() => {
                setSelected(null);
                setPassword("");
                setError(null);
              }}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-even-offwhite/50 text-xs font-medium uppercase tracking-wider hover:text-even-offwhite/80 transition-colors cursor-pointer disabled:opacity-40"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Elegir otro mesero
            </button>

            {allowGuest && (
              <button
                onClick={() => onResolved(null)}
                disabled={submitting}
                className="w-full py-2.5 rounded-md border border-white/15 text-even-offwhite/60 text-xs font-medium uppercase tracking-wider hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Continuar como invitado
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

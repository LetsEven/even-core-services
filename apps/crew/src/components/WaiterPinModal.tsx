import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { Check, Loader2, X } from "lucide-react";
import { verifyWaiterPassword } from "../services/api";
import { markWaiterAuthenticated } from "../utils/waiterLogin";

interface Waiter {
  id: string;
  name: string;
}

interface Props {
  branchId: string;
  waiter: Waiter;
  onConfirmed: () => void;
  onCancel: () => void;
}

// Se abre al elegir, en el selector de mesero de OrderCard, a alguien con
// quien todavía no te autenticaste en este dispositivo. Una vez correcto el
// PIN, queda recordado (markWaiterAuthenticated) — no vuelve a pedirlo para
// ese mesero en este device.
export default function WaiterPinModal({
  branchId,
  waiter,
  onConfirmed,
  onCancel,
}: Props) {
  const { getToken } = useAuth();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No requerimos password.length > 0: algunos meseros tienen contraseña
  // vacía en Soft Restaurant, así que un campo vacío es un intento válido.
  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No autenticado");
      const ok = await verifyWaiterPassword(
        branchId,
        waiter.id,
        password,
        token,
      );
      if (ok) {
        markWaiterAuthenticated(branchId, waiter.id);
        onConfirmed();
        return;
      }
      setError("PIN incorrecto");
    } catch {
      setError("Error al verificar. Intenta de nuevo.");
    } finally {
      // No dejar el PIN en memoria más de lo necesario.
      setPassword("");
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-xs rounded-lg border border-white/10 shadow-2xl px-6 py-6 flex flex-col gap-4"
        style={{ background: "#023828" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-even-offwhite/40 text-xs uppercase tracking-widest mb-0.5">
              PIN de mesero
            </p>
            <h2 className="text-even-offwhite font-bold text-lg leading-none">
              {waiter.name}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-md text-even-offwhite/30 hover:text-even-offwhite hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
          placeholder="PIN"
          autoFocus
          className="w-full rounded-lg border border-white/8 px-4 py-3 text-sm text-even-offwhite/80 placeholder-white/20 focus:outline-none focus:border-white/20"
          style={{ background: "rgba(255,255,255,0.04)" }}
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
      </div>
    </div>,
    document.body,
  );
}

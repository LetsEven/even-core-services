import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Check, Loader2, User, ArrowLeft } from "lucide-react";
import { Button, Input, Modal } from "@even/ui";
import { verifyWaiterPassword } from "../services/api";
import type { WaiterSession } from "../utils/waiterSession";

interface Props {
  branchId: string;
  availableWaiters: WaiterSession[];
  allowGuest: boolean;
  onResolved: (waiter: WaiterSession | null) => void;
  // Mesero cuya sesión ya está guardada en este dispositivo (si hay). Elegir
  // a esa misma persona de la lista resuelve directo sin pedir contraseña —
  // ya se verificó antes en este dispositivo. Elegir a cualquier otro sí la
  // pide (o intenta vacía primero, ver handleSelectWaiter).
  currentWaiterId?: string;
}

// Modal de login de mesero por dispositivo — adaptado de WaiterLoginScreen.tsx
// (pantalla completa, commit bede8c0, eliminado en fe17dfa) pero como overlay,
// no bloqueando el resto de la app. `allowGuest=false` lo usa
// useWaiterSession().requireLogin cuando una acción puntual necesita
// identidad sí o sí — ahí no se puede "seguir como invitado" (la acción no
// se ejecuta como EVEN), pero sí se puede cancelar y no hacer nada: el botón
// de abajo cambia a "Cancelar" (mismo onResolved(null), el caller nunca ve
// su callback de éxito disparado) y no se cierra solo al tocar fuera, para
// que no se cancele sin querer por un mal click.
export default function WaiterLoginModal({
  branchId,
  availableWaiters,
  allowGuest,
  onResolved,
  currentWaiterId,
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
  const [checkingId, setCheckingId] = useState<string | null>(null);

  // Al tocar un mesero, intenta entrar directo con contraseña vacía antes de
  // mostrar el campo — varios meseros no tienen contraseña en Soft
  // Restaurant, y para esos no tiene sentido hacerlos ver/confirmar un campo
  // vacío. Si el intento silencioso falla (sí tiene contraseña), recién ahí
  // se muestra la pantalla normal para que la escriba.
  async function handleSelectWaiter(w: WaiterSession) {
    if (checkingId) return;
    if (w.id === currentWaiterId) {
      onResolved(w);
      return;
    }
    setCheckingId(w.id);
    try {
      const token = await getToken();
      if (token) {
        const ok = await verifyWaiterPassword(branchId, w.id, "", token);
        if (ok) {
          onResolved(w);
          return;
        }
      }
    } catch {
      // si falla el intento silencioso (ej. sin conexión), sigue al campo
      // de contraseña normal en vez de quedarse atorado
    } finally {
      setCheckingId(null);
    }
    setSelected(w);
  }

  // No requerimos password.length > 0: algunos meseros tienen contraseña
  // vacía en Soft Restaurant, así que un campo vacío es un intento válido
  // (cubre el caso en que el intento silencioso de arriba falló por otra
  // razón, ej. sin conexión, no porque la contraseña esté mal).
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

  const cancelLabel = allowGuest ? "Continuar como invitado" : "Cancelar";

  return (
    <Modal
      open
      onClose={() => onResolved(null)}
      dismissible={allowGuest}
      title={selected ? "Ingresa tu contraseña" : "¿Quién eres?"}
      description={selected ? selected.name : "Selecciona tu nombre de mesero"}
    >
      {!selected ? (
        <div className="flex flex-col gap-3">
          <div className="max-h-64 overflow-y-auto rounded-lg border border-stroke-soft">
            {realWaiters.map((w, idx) => (
              <button
                key={w.id}
                type="button"
                onClick={() => handleSelectWaiter(w)}
                disabled={!!checkingId}
                className={`flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-black/5 disabled:cursor-default ${
                  idx > 0 ? "border-t border-stroke-soft" : ""
                }`}
              >
                <User className="size-4 shrink-0 text-tone-500" />
                <span className="text-sm font-medium text-tone-700">
                  {w.name}
                </span>
                {checkingId === w.id && (
                  <Loader2 className="ml-auto size-3.5 animate-spin text-tone-500" />
                )}
              </button>
            ))}
          </div>

          <Button variant="outline" fullWidth onClick={() => onResolved(null)}>
            {cancelLabel}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Input
            type="password"
            inputMode="numeric"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
            }}
            placeholder="Contraseña"
            aria-label="Contraseña"
            autoFocus
            error={error ?? undefined}
          />

          <Button fullWidth loading={submitting} onClick={handleConfirm}>
            {!submitting && <Check className="size-4" />}
            {submitting ? "Verificando..." : "Confirmar"}
          </Button>

          <Button
            variant="ghost"
            fullWidth
            disabled={submitting}
            onClick={() => {
              setSelected(null);
              setPassword("");
              setError(null);
            }}
          >
            <ArrowLeft className="size-3.5" />
            Elegir otro mesero
          </Button>

          <Button
            variant="outline"
            fullWidth
            disabled={submitting}
            onClick={() => onResolved(null)}
          >
            {cancelLabel}
          </Button>
        </div>
      )}
    </Modal>
  );
}

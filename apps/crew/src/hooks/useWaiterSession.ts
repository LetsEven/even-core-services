import { useCallback, useRef, useState } from "react";
import {
  getWaiterSession,
  setWaiterSession,
  type WaiterSession,
} from "../utils/waiterSession";

// Sesión de mesero por dispositivo (ver plan "Sesión de mesero por
// dispositivo"). El modal de login aparece solo (a) al iniciar la app, si la
// sucursal tiene meseros reales y el dispositivo no tiene sesión guardada
// para ella — dismisseable como invitado, sin persistir la decisión, así que
// vuelve a aparecer en la próxima carga o al cambiar de sucursal —, o (b)
// cuando una acción puntual (reclamar una orden, agregar un platillo, abrir
// una mesa) lo requiere explícitamente vía `requireLogin`, caso en el que no
// se puede seguir como invitado.
export function useWaiterSession(
  branchId: string | null,
  availableWaiters: { id: string; name: string }[],
) {
  // Se reinicia al cambiar de sucursal ajustando el estado durante el render
  // (patrón recomendado por React para "resetear estado cuando cambia una
  // prop") en vez de un efecto, para no disparar un render extra.
  const [branchKey, setBranchKey] = useState(branchId);
  const [waiterSession, setWaiterSessionState] =
    useState<WaiterSession | null>(() =>
      branchId ? getWaiterSession(branchId) : null,
    );
  const [dismissedBranchId, setDismissedBranchId] = useState<string | null>(
    null,
  );
  const [loginRequired, setLoginRequired] = useState(false);
  const pendingResolveRef = useRef<((w: WaiterSession) => void) | null>(null);

  if (branchId !== branchKey) {
    setBranchKey(branchId);
    setWaiterSessionState(branchId ? getWaiterSession(branchId) : null);
    setLoginRequired(false);
    // No hace falta limpiar pendingResolveRef acá: al pasar loginRequired a
    // false el modal que lo dispararía se desmonta sin llamar onResolved, y
    // la próxima requireLogin() sobrescribe el ref de todos modos.
  }

  // Mismo criterio que WaiterLoginModal: "EVEN" (sintético o con ese nombre)
  // no es un mesero real para iniciar sesión.
  const hasRealWaiters = availableWaiters.some(
    (w) => w.id !== "EVEN" && w.name.trim().toUpperCase() !== "EVEN",
  );

  const autoShow =
    !!branchId &&
    hasRealWaiters &&
    !waiterSession &&
    dismissedBranchId !== branchId;

  const modalOpen = autoShow || loginRequired;
  const allowGuest = !loginRequired;

  const resolveLogin = useCallback(
    (waiter: WaiterSession | null) => {
      if (!branchId) return;
      if (waiter) {
        setWaiterSession(branchId, waiter);
        setWaiterSessionState(waiter);
        const pending = pendingResolveRef.current;
        pendingResolveRef.current = null;
        pending?.(waiter);
      } else {
        setDismissedBranchId(branchId);
      }
      setLoginRequired(false);
    },
    [branchId],
  );

  const requireLogin = useCallback(
    (
      onSuccess: (w: WaiterSession) => void,
      options?: { forcePicker?: boolean },
    ) => {
      // forcePicker: usado por "Asignarme" — no asume que quien reclama la
      // orden es necesariamente quien dejó su sesión guardada en este
      // dispositivo (puede estar compartido entre meseros), así que siempre
      // muestra la lista en vez de auto-resolver con waiterSession.
      if (waiterSession && !options?.forcePicker) {
        onSuccess(waiterSession);
        return;
      }
      // Sucursal sin meseros reales: el modal solo mostraría una lista vacía
      // sin forma de continuar. Se sigue como EVEN (sin persistir sesión).
      if (!hasRealWaiters) {
        onSuccess({ id: "EVEN", name: "EVEN" });
        return;
      }
      pendingResolveRef.current = onSuccess;
      setLoginRequired(true);
    },
    [waiterSession, hasRealWaiters],
  );

  return { waiterSession, modalOpen, allowGuest, resolveLogin, requireLogin };
}

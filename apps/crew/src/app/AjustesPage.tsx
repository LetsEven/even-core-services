import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth, useClerk } from "@clerk/clerk-react";
import {
  Bell,
  ChevronRight,
  LogOut,
  Monitor,
  Printer,
  UserRound,
} from "lucide-react";
import { Button } from "@even/ui";
import { deleteFcmToken } from "../services/api";
import { isTauri } from "../lib/platform";
import {
  enableWebPush,
  getWebPushStatus,
  removeWebPushToken,
  type WebPushStatus,
} from "../lib/webPush";
import { useSession } from "./session/context";

function Row({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: typeof Printer;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 min-h-14 rounded-xl bg-white border border-even-evergreen/10 text-even-evergreen hover:bg-even-evergreen/5 transition-colors"
    >
      <Icon className="w-5 h-5 shrink-0 text-even-evergreen/60" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && (
          <span className="block text-xs text-even-evergreen/50">{hint}</span>
        )}
      </span>
      <ChevronRight className="w-4 h-4 text-even-evergreen/30" />
    </Link>
  );
}

export default function AjustesPage() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { waiterSession, requireWaiterLogin } = useSession();

  const [pushStatus, setPushStatus] = useState<WebPushStatus>("unsupported");
  useEffect(() => {
    getWebPushStatus().then(setPushStatus);
  }, []);

  const handleEnablePush = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      setPushStatus(await enableWebPush(token));
    } catch (err) {
      console.warn("[PUSH] No se pudieron activar las notificaciones:", err);
    }
  }, [getToken]);

  const handleSignOut = useCallback(async () => {
    if (!isTauri()) {
      try {
        const token = await getToken();
        if (token) await removeWebPushToken(token);
      } catch {
        // silently fail
      }
      signOut();
      return;
    }
    try {
      const token = await getToken();
      const fcmToken = await (async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          return await invoke<string | null>("get_fcm_token");
        } catch {
          return null;
        }
      })();
      if (token && fcmToken) await deleteFcmToken(token, fcmToken);
    } catch {
      // silently fail
    }
    signOut();
  }, [getToken, signOut]);

  return (
    <div className="flex-1 flex flex-col">
      <h1 className="px-5 pt-4 pb-3 text-even-offwhite font-medium text-xl uppercase tracking-widest text-center">
        Ajustes
      </h1>
      <div className="flex-1 rounded-t-lg px-5 pt-6 pb-6 bg-even-offwhite text-even-evergreen">
        <div className="mx-auto w-full max-w-xl flex flex-col gap-3">
          <button
            onClick={() => requireWaiterLogin(() => {}, { forcePicker: true })}
            className="flex items-center gap-3 px-4 min-h-14 rounded-xl bg-white border border-even-evergreen/10 text-left hover:bg-even-evergreen/5 transition-colors cursor-pointer"
          >
            <UserRound className="w-5 h-5 shrink-0 text-even-evergreen/60" />
            <span className="flex-1">
              <span className="block text-sm font-medium">Mesero activo</span>
              <span className="block text-xs text-even-evergreen/50">
                {waiterSession?.name ?? "Invitado"} · toca para cambiar
              </span>
            </span>
            <ChevronRight className="w-4 h-4 text-even-evergreen/30" />
          </button>

          <Row
            to="/ajustes/impresoras"
            icon={Printer}
            label="Impresoras"
            hint="Escanear, nombrar y asignar rol"
          />
          <Row
            to="/ajustes/dispositivos"
            icon={Monitor}
            label="Dispositivos"
            hint="Equipos conectados y Master"
          />

          {pushStatus === "default" && (
            <button
              onClick={handleEnablePush}
              className="flex items-center gap-3 px-4 min-h-14 rounded-xl bg-even-grass/20 border border-even-grass/40 text-left cursor-pointer"
            >
              <Bell className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">Activar notificaciones</span>
            </button>
          )}
          {pushStatus === "denied" && (
            <p className="flex items-start gap-3 px-4 py-3 text-xs leading-snug text-even-evergreen/60">
              <Bell className="w-4 h-4 shrink-0" />
              Notificaciones bloqueadas: actívalas en Ajustes del iPad
            </p>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="mt-4 self-start border-danger-600 text-danger-600"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}

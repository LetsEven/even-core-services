import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, useClerk } from "@clerk/clerk-react";
import {
  Menu,
  PrinterIcon,
  History,
  Receipt,
  LogOut,
  RefreshCw,
  Bell,
} from "lucide-react";
import { deleteFcmToken } from "../services/api";
import { isTauri } from "../lib/platform";
import {
  enableWebPush,
  getWebPushStatus,
  removeWebPushToken,
  type WebPushStatus,
} from "../lib/webPush";

interface Props {
  onOpenPrinters: () => void;
  onOpenHistorial: () => void;
  onOpenComprobantes: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

// Barra de arriba (hamburguesa + logo + actualizar), compartida por Kitchen
// y SpatialGrid — antes estaba duplicada en los dos archivos. Lo que va
// debajo (título, selector de sucursal, stats) sigue siendo local a cada
// pantalla, porque sí difiere entre ellas.
export default function AppHeader({
  onOpenPrinters,
  onOpenHistorial,
  onOpenComprobantes,
  onRefresh,
  refreshing,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const [pushStatus, setPushStatus] = useState<WebPushStatus>("unsupported");
  useEffect(() => {
    if (menuOpen) getWebPushStatus().then(setPushStatus);
  }, [menuOpen]);

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
    <header className="px-5 pt-5 pb-2 flex items-center justify-between relative">
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-2 rounded-lg text-even-offwhite/60 hover:text-even-offwhite hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        {menuOpen && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-even-evergreen border border-white/10 rounded-lg overflow-hidden shadow-xl z-50">
            <button
              onClick={() => {
                onOpenPrinters();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-wider text-even-offwhite/80 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <PrinterIcon className="w-4 h-4 shrink-0" />
              Impresoras
            </button>

            <button
              onClick={() => {
                onOpenHistorial();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-wider text-even-offwhite/80 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <History className="w-4 h-4 shrink-0" />
              Historial
            </button>

            <button
              onClick={() => {
                onOpenComprobantes();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-wider text-even-offwhite/80 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Receipt className="w-4 h-4 shrink-0" />
              Comprobantes
            </button>

            {pushStatus === "default" && (
              <button
                onClick={() => {
                  handleEnablePush();
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-wider text-even-grass hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4 shrink-0" />
                Activar notificaciones
              </button>
            )}
            {pushStatus === "denied" && (
              <p className="flex items-start gap-3 px-4 py-3 text-[11px] leading-snug text-even-offwhite/50">
                <Bell className="w-4 h-4 shrink-0" />
                Notificaciones bloqueadas: actívalas en Ajustes del iPad
              </p>
            )}

            <div className="h-px bg-white/10 mx-3" />
            <button
              onClick={() => {
                handleSignOut();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-wider text-rose-400 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>

      <img
        src="/even/even-asterisk-grass.svg"
        className="absolute left-1/2 -translate-x-1/2 w-8 h-8"
        alt="Even"
      />

      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-1.5 px-3 py-2 rounded-md text-even-offwhite/60 hover:text-even-offwhite hover:bg-white/10 transition-colors text-xs uppercase tracking-wider disabled:opacity-50 cursor-pointer"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        Actualizar
      </button>
    </header>
  );
}

import { Link } from "react-router";
import {
  PrinterCheck,
  RefreshCw,
  UserRound,
  LogOut,
} from "lucide-react";
import { IconButton, cn } from "@even/ui";
import { canPrintHere } from "../lib/platform";
import { isDemoMode } from "../lib/demoMode";
import { ROLE_LABELS, useAuth } from "../lib/auth";
import { useBridgeStatus } from "../features/impresion/bridgeStatus";
import { getPrintingStatus } from "../features/impresion/printingStatus";
import { useSession } from "./session/context";

interface Props {
  onRefresh: () => void;
  refreshing: boolean;
}

function usePrintStatus() {
  const { masterDeviceId, deviceId, connectedDevices } = useSession();
  const bridge = useBridgeStatus();
  const status = getPrintingStatus({
    deviceId,
    masterDeviceId,
    connectedDevices,
    canPrint: canPrintHere(),
    bridge,
  });
  switch (status.kind) {
    case "bridge":
      return { label: "Imprime el bridge", ok: true };
    case "este-equipo":
      return {
        label: isDemoMode() ? "Imprime aquí (demo)" : "Imprime aquí",
        ok: true,
      };
    case "otro-equipo":
      return { label: "Imprime otro equipo", ok: true };
    default:
      return { label: "Nadie imprime", ok: false };
  }
}

export default function TopBar({ onRefresh, refreshing }: Props) {
  const { waiterSession, requireWaiterLogin } = useSession();
  const print = usePrintStatus();
  const { kind, user, signOut, hasPermission } = useAuth();

  const chipClass =
    "flex items-center gap-1.5 min-w-0 max-w-[60%] sm:max-w-64 text-even-offwhite/80 hover:text-even-offwhite bg-white/10 hover:bg-white/15 rounded-full px-3 min-h-11 text-xs transition-colors cursor-pointer";

  // Solo avisa cuando nadie imprime: la cocina trabaja con tickets impresos y
  // ese fallo no debe pasar desapercibido. Con todo bien no ocupa espacio.
  const printWarning = print.ok ? null : (
    <>
      <PrinterCheck className="w-4 h-4" aria-hidden />
      <span className="sr-only">{print.label}. Revisar impresión</span>
    </>
  );
  const printWarningClass = cn(
    "shrink-0 flex items-center justify-center min-h-11 min-w-11 rounded-full",
    "bg-warning-500/20 text-warning-300 hover:bg-warning-500/30",
  );

  return (
    <header className="shrink-0 bg-even-evergreen border-b border-white/10">
      <div className="flex items-center gap-2 px-3 py-2">
        <img
          src="/even/even-asterisk-grass.svg"
          alt="Even"
          className="w-7 h-7 shrink-0 lg:hidden"
        />

        {/* Usuario activo: tocar permite cambiar de usuario. */}
        {kind === "local" && user ? (
          <button
            onClick={() => void signOut()}
            title="Cambiar de usuario"
            aria-label={`${user.name}, ${ROLE_LABELS[user.role]}. Cambiar de usuario`}
            className={chipClass}
          >
            <UserRound className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {user.name} · {ROLE_LABELS[user.role]}
            </span>
            <LogOut className="w-3.5 h-3.5 shrink-0 text-even-offwhite/50" />
          </button>
        ) : (
          <button
            onClick={() => requireWaiterLogin(() => {}, { forcePicker: true })}
            title="Cambiar de usuario"
            aria-label={`${waiterSession?.name ?? "Invitado"}. Cambiar de usuario`}
            className={chipClass}
          >
            <UserRound className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{waiterSession?.name ?? "Invitado"}</span>
          </button>
        )}

        <div className="flex-1" />

        {printWarning &&
          (hasPermission("ajustes.impresoras") ? (
            <Link
              to="/ajustes/dispositivos"
              title={print.label}
              className={printWarningClass}
            >
              {printWarning}
            </Link>
          ) : (
            <span title={print.label} className={printWarningClass}>
              {printWarning}
            </span>
          ))}

        <IconButton
          aria-label="Actualizar"
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="shrink-0 min-h-11 min-w-11 text-even-offwhite/70 hover:bg-white/10"
        >
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </IconButton>
      </div>
    </header>
  );
}

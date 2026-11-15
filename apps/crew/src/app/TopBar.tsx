import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Printer, RefreshCw, UserRound } from "lucide-react";
import { Badge, IconButton, cn } from "@even/ui";
import ServiceSwitcher from "../components/ServiceSwitcher";
import { canPrintHere } from "../lib/platform";
import { isDemoMode } from "../lib/demoMode";
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
      return { label: isDemoMode() ? "Imprime aquí (demo)" : "Imprime aquí", ok: true };
    case "otro-equipo":
      return { label: "Imprime otro equipo", ok: true };
    default:
      return { label: "Nadie imprime", ok: false };
  }
}

export default function TopBar({ onRefresh, refreshing }: Props) {
  const {
    branches,
    branchesLoading,
    branchId,
    currentBranch,
    changeBranch,
    activeOrderTypes,
    resolvedOrderType,
    setSelectedOrderType,
    waiterSession,
    requireWaiterLogin,
  } = useSession();
  const print = usePrintStatus();

  const [branchOpen, setBranchOpen] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!branchOpen) return;
    const handler = (e: MouseEvent) => {
      if (!branchRef.current?.contains(e.target as Node)) setBranchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [branchOpen]);

  return (
    <header className="shrink-0 bg-even-evergreen border-b border-white/10">
      <div className="flex items-center gap-2 px-3 py-2">
        <img
          src="/even/even-asterisk-grass.svg"
          alt="Even"
          className="w-7 h-7 lg:hidden"
        />

        <div className="relative min-w-0" ref={branchRef}>
          <button
            onClick={() => branches.length > 1 && setBranchOpen((v) => !v)}
            disabled={branchesLoading || branches.length === 0}
            className="flex items-center gap-2 max-w-52 bg-white/10 hover:bg-white/15 text-even-offwhite/90 text-xs uppercase tracking-wider rounded-full px-3 min-h-9 border border-white/10 transition-colors cursor-pointer disabled:cursor-default"
          >
            <span className="truncate">
              {currentBranch?.name ??
                (branchesLoading ? "Cargando..." : "Seleccionar sucursal")}
            </span>
            {branches.length > 1 && (
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 shrink-0 text-even-offwhite/40 transition-transform",
                  branchOpen && "rotate-180",
                )}
              />
            )}
          </button>
          {branchOpen && branches.length > 1 && (
            <ul className="absolute z-50 top-full mt-1 left-0 min-w-full w-max bg-even-evergreen border border-white/10 rounded-lg overflow-hidden shadow-xl">
              {branches.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => {
                      changeBranch(b.id);
                      setBranchOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-4 px-4 py-2.5 text-sm text-even-offwhite/80 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <span>{b.name}</span>
                    {b.id === branchId && (
                      <Check className="w-3.5 h-3.5 text-even-grass shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => requireWaiterLogin(() => {}, { forcePicker: true })}
          title="Cambiar mesero"
          className="flex items-center gap-1.5 max-w-36 text-even-offwhite/80 hover:text-even-offwhite bg-white/10 hover:bg-white/15 rounded-full px-3 min-h-9 text-xs transition-colors cursor-pointer"
        >
          <UserRound className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{waiterSession?.name ?? "Invitado"}</span>
        </button>

        <Badge
          size="sm"
          variant={print.ok ? "soft" : "neutral"}
          className={cn(
            "hidden sm:inline-flex shrink-0 min-h-7",
            print.ok
              ? "bg-even-grass/20 text-even-grass"
              : "bg-white/10 text-even-offwhite/60 border-white/10",
          )}
        >
          <Printer className="w-3 h-3" />
          {print.label}
        </Badge>

        <IconButton
          aria-label="Actualizar"
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-even-offwhite/70 hover:bg-white/10"
        >
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </IconButton>
      </div>

      <ServiceSwitcher
        activeOrderTypes={activeOrderTypes}
        selected={resolvedOrderType}
        onSelect={setSelectedOrderType}
      />
    </header>
  );
}

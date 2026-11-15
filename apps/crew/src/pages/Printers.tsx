import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { useAuth } from "../lib/auth";
import {
  ArrowLeft,
  Cable,
  ChevronRight,
  Loader2,
  Monitor,
  Pencil,
  Play,
  PrinterIcon,
  Wifi,
} from "lucide-react";
import { Badge, Button, Card } from "@even/ui";
import { usePrinters, type UsbPrinterDevice } from "../hooks/usePrinters";
import {
  getPrinters,
  syncPrinters,
  updatePrinter,
  deletePrinter,
  type PrinterRecord,
} from "../services/api";
import type { CrewDevice } from "../hooks/useSocket";
import { canPrintHere } from "../lib/platform";
import PrintingBanner from "../features/impresion/PrintingBanner";
import PrinterEditor from "../features/impresion/PrinterEditor";
import {
  ROLES,
  groupByStation,
  printerAddress,
  roleLabel,
} from "../features/impresion/stations";

interface Props {
  onBack: () => void;
  deviceId: string;
  connectedDevices: CrewDevice[];
  masterDeviceId: string | null;
  setMaster: (deviceId: string) => void;
  branchesLoading: boolean;
  branchId: string | null;
  onPrintersChanged?: () => void;
}

// Lo que se está editando: una impresora guardada o un USB detectado sin guardar.
type Editing =
  | { kind: "saved"; id: string }
  | { kind: "new-usb"; deviceName: string };

type Testable = Pick<PrinterRecord, "connection_type" | "ip" | "port" | "usb_device_name">;

function errMsg(e: unknown, fallback = ""): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === "string" && e ? e : fallback || String(e);
}

function RoleBadge({ role }: { role: string | null }) {
  const r = ROLES.find((x) => x.value === role);
  if (!r) {
    return (
      <Badge variant="neutral" size="sm">
        Sin estación
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" size="sm" className={`ring-1 ${r.badge}`}>
      {r.label}
    </Badge>
  );
}

export default function Printers({
  onBack,
  deviceId,
  connectedDevices,
  masterDeviceId,
  setMaster,
  branchesLoading,
  branchId,
  onPrintersChanged,
}: Props) {
  const { getToken } = useAuth();
  const canPrint = canPrintHere();
  const { scanning, scan, printTest, usbDevices, scanningUsb, scanUsb, printTestUsb } =
    usePrinters();

  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPrinters = useCallback(
    async (id: string) => {
      const token = await getToken();
      if (!token || !id) return;
      setLoading(true);
      setError(null);
      try {
        setPrinters(await getPrinters(id));
      } catch (e) {
        setError(errMsg(e, "Error al cargar impresoras"));
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    if (branchId) loadPrinters(branchId);
  }, [branchId, loadPrinters]);

  // Buscar WiFi: detecta en la red y sincroniza con el servidor.
  const handleScanWifi = useCallback(async () => {
    if (!branchId) return;
    setNotice(null);
    const found = await scan();
    if (found.length === 0) {
      setNotice("No se encontraron impresoras WiFi en la red.");
      return;
    }
    const token = await getToken();
    if (!token) return;
    try {
      setPrinters(await syncPrinters(token, branchId, found));
      onPrintersChanged?.();
    } catch (e) {
      setError(errMsg(e, "Error al sincronizar impresoras"));
    }
  }, [scan, getToken, branchId, onPrintersChanged]);

  // USB: solo detecta localmente; no guarda hasta asignar estación.
  const handleScanUsb = useCallback(async () => {
    setNotice(null);
    try {
      await scanUsb();
    } catch (e) {
      setNotice(errMsg(e));
    }
  }, [scanUsb]);

  // Una sola función de prueba para WiFi y USB.
  const runTest = useCallback(
    async (p: Testable) => {
      if (p.connection_type === "usb" && p.usb_device_name) {
        await printTestUsb(p.usb_device_name);
      } else if (p.ip && p.port) {
        await printTest(p.ip, p.port);
      }
    },
    [printTest, printTestUsb],
  );

  const testMany = useCallback(
    async (key: string, targets: Testable[], okMessage: string) => {
      setTesting(key);
      setNotice(null);
      try {
        for (const t of targets) await runTest(t);
        setNotice(okMessage);
      } catch (e) {
        const msg = errMsg(e);
        setNotice(
          msg.includes("USB_PERMISSION_REQUESTED")
            ? "Permiso USB solicitado: acepta el diálogo y prueba de nuevo."
            : `La prueba falló: ${msg}`,
        );
      } finally {
        setTesting(null);
      }
    },
    [runTest],
  );

  const savedUsbNames = new Set(
    printers.filter((p) => p.connection_type === "usb").map((p) => p.usb_device_name),
  );
  const newUsbDevices = usbDevices.filter((d) => !savedUsbNames.has(d.device_name));
  const stations = groupByStation(printers);

  const closeEditor = () => {
    setEditing(null);
    setEditorError(null);
  };

  const handleSave = async (
    target: Editing,
    values: { name: string; role: string },
  ) => {
    const token = await getToken();
    if (!token || !branchId) return;
    setSaving(true);
    setEditorError(null);
    try {
      let id: string | undefined;
      if (target.kind === "saved") {
        id = target.id;
      } else {
        const synced = await syncPrinters(token, branchId, [
          { usb_device_name: target.deviceName, connection_type: "usb" },
        ]);
        id = synced.find((p) => p.usb_device_name === target.deviceName)?.id;
      }
      if (!id) throw new Error("No se pudo crear la impresora");
      const updated = await updatePrinter(token, id, {
        name: values.name || undefined,
        role: values.role || undefined,
      });
      setPrinters((prev) =>
        prev.some((p) => p.id === updated.id)
          ? prev.map((p) => (p.id === updated.id ? updated : p))
          : [...prev, updated],
      );
      closeEditor();
      onPrintersChanged?.();
    } catch (e) {
      setEditorError(errMsg(e, "Error al guardar"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (printerId: string) => {
    const token = await getToken();
    if (!token) return;
    try {
      await deletePrinter(token, printerId);
      setPrinters((prev) => prev.filter((p) => p.id !== printerId));
      closeEditor();
      onPrintersChanged?.();
    } catch (e) {
      setEditorError(errMsg(e, "Error al eliminar"));
    }
  };

  const testButton = (key: string, label: string, targets: Testable[], ok: string) => (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0"
      disabled={!canPrint || (testing !== null && testing !== key)}
      loading={testing === key}
      onClick={() => testMany(key, targets, ok)}
      title={canPrint ? undefined : "La versión web no puede imprimir"}
    >
      {testing !== key && <Play className="size-3.5" />}
      {label}
    </Button>
  );

  const renderSaved = (p: PrinterRecord) => {
    if (editing?.kind === "saved" && editing.id === p.id) {
      return (
        <li key={p.id}>
          <PrinterEditor
            address={printerAddress(p)}
            connection={p.connection_type === "usb" ? "usb" : "wifi"}
            initialName={p.name ?? ""}
            initialRole={p.role ?? ""}
            saving={saving}
            error={editorError}
            onSave={(v) => handleSave(editing, v)}
            onCancel={closeEditor}
            onDelete={() => handleDelete(p.id)}
          />
        </li>
      );
    }
    return (
      <li key={p.id}>
        <Card padding="sm" className="flex items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-medium text-even-evergreen">
              {p.connection_type === "usb" ? (
                <Cable className="size-3.5 shrink-0 opacity-50" />
              ) : (
                <Wifi className="size-3.5 shrink-0 opacity-50" />
              )}
              <span className="truncate">{p.name || "Sin nombre"}</span>
            </span>
            <span className="truncate font-mono text-xs text-even-evergreen/50">
              {printerAddress(p)}
            </span>
            <RoleBadge role={p.role} />
          </div>
          <div className="flex shrink-0 gap-2">
            {testButton(`p:${p.id}`, "Probar", [p], `Prueba enviada a ${p.name || printerAddress(p)}.`)}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Editar impresora"
              onClick={() => {
                setEditorError(null);
                setEditing({ kind: "saved", id: p.id });
              }}
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        </Card>
      </li>
    );
  };

  const renderNewUsb = (d: UsbPrinterDevice) => {
    if (editing?.kind === "new-usb" && editing.deviceName === d.device_name) {
      return (
        <li key={d.device_name}>
          <PrinterEditor
            address={d.device_name}
            connection="usb"
            initialName=""
            initialRole=""
            saving={saving}
            error={editorError}
            onSave={(v) => handleSave(editing, v)}
            onCancel={closeEditor}
          />
        </li>
      );
    }
    const asTestable: Testable = {
      connection_type: "usb",
      ip: null,
      port: null,
      usb_device_name: d.device_name,
    };
    return (
      <li key={d.device_name}>
        <Card padding="sm" className="flex items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-medium text-even-evergreen">
              <Cable className="size-3.5 shrink-0 opacity-50" />
              <span className="truncate">{d.device_name}</span>
            </span>
            <Badge variant="soft" size="sm">
              Detectada, sin guardar
            </Badge>
          </div>
          <div className="flex shrink-0 gap-2">
            {testButton(`u:${d.device_name}`, "Probar", [asTestable], `Prueba enviada a ${d.device_name}.`)}
            <Button
              size="sm"
              onClick={() => {
                setEditorError(null);
                setEditing({ kind: "new-usb", deviceName: d.device_name });
              }}
            >
              Configurar
            </Button>
          </div>
        </Card>
      </li>
    );
  };

  return (
    <div className="flex flex-1 flex-col" style={{ background: "#023828" }}>
      <header className="flex items-center gap-2 px-5 pt-5 pb-2">
        <button
          onClick={onBack}
          aria-label="Volver a Ajustes"
          className="cursor-pointer rounded-lg p-2 text-even-offwhite/60 transition-colors hover:bg-white/10 hover:text-even-offwhite"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h1 className="text-base font-medium uppercase tracking-widest text-even-offwhite">
          Impresoras
        </h1>
      </header>

      <div
        className="mt-4 flex flex-1 flex-col gap-5 rounded-t-lg px-5 pt-6 pb-6 text-even-evergreen"
        style={{ background: "#FEFEEB" }}
      >
        <PrintingBanner
          deviceId={deviceId}
          connectedDevices={connectedDevices}
          masterDeviceId={masterDeviceId}
          setMaster={setMaster}
        />

        <Link
          to="/ajustes/dispositivos"
          className="flex items-center justify-between rounded-xl bg-even-evergreen/5 px-4 py-3 text-sm text-even-evergreen hover:bg-even-evergreen/10"
        >
          <span className="flex items-center gap-2">
            <Monitor className="size-4" />
            Dispositivos: elige cuál imprime los tickets
          </span>
          <ChevronRight className="size-4" />
        </Link>

        {notice && (
          <p role="status" className="rounded-lg bg-even-evergreen/5 px-3 py-2 text-xs">
            {notice}
          </p>
        )}

        {branchesLoading || loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-even-evergreen/50" />
          </div>
        ) : !branchId ? (
          <div className="flex flex-1 items-center justify-center text-sm text-even-evergreen/40">
            Selecciona una sucursal para ver sus impresoras
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-even-evergreen/70">
            <p className="text-center text-sm">{error}</p>
            <Button size="sm" onClick={() => loadPrinters(branchId)}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            {stations.length > 0 && (
              <section>
                <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-even-evergreen/50">
                  Estaciones
                </h2>
                <ul className="flex flex-col gap-2">
                  {stations.map((s) => (
                    <li key={s.role}>
                      <Card padding="sm" className="flex items-center justify-between gap-3 px-4">
                        <div>
                          <p className="text-sm font-medium">{s.label}</p>
                          <p className="text-xs text-even-evergreen/50">
                            {s.printers.length} impresora{s.printers.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        {testButton(
                          `s:${s.role}`,
                          "Probar estación",
                          s.printers,
                          `Prueba enviada a la estación ${s.label}.`,
                        )}
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="px-1 text-xs uppercase tracking-wide text-even-evergreen/50">
                  Impresoras · {printers.length}
                </h2>
                {canPrint && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleScanWifi} loading={scanning}>
                      {!scanning && <Wifi className="size-3.5" />}
                      Buscar WiFi
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleScanUsb} loading={scanningUsb}>
                      {!scanningUsb && <Cable className="size-3.5" />}
                      Detectar USB
                    </Button>
                  </div>
                )}
              </div>

              {printers.length === 0 && newUsbDevices.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-even-evergreen/40">
                  <PrinterIcon className="size-8 opacity-30" />
                  <p className="text-center text-xs">
                    {canPrint
                      ? "No hay impresoras. Usa Buscar WiFi o Detectar USB."
                      : "No hay impresoras configuradas."}
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {printers.map(renderSaved)}
                  {newUsbDevices.map(renderNewUsb)}
                </ul>
              )}
              {!canPrint && (
                <p className="mt-3 px-1 text-xs text-even-evergreen/50">
                  La versión web no puede buscar ni probar impresoras. Hazlo desde la app de
                  Windows o Android ({roleLabel("kitchen")}, {roleLabel("bar")}...).
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Card, Input, Modal, cn } from "@even/ui";
import { ROLES } from "./stations";

interface Props {
  /** Dirección técnica: ip:puerto o nombre USB. Solo informativa. */
  address: string;
  connection: "wifi" | "usb";
  initialName: string;
  initialRole: string;
  saving?: boolean;
  error?: string | null;
  /** Si no se pasa, no se muestra "Eliminar" (impresora detectada aún sin guardar). */
  onDelete?: () => Promise<void> | void;
  onSave: (values: { name: string; role: string }) => void;
  onCancel: () => void;
}

/** Editor único de impresoras: sirve para WiFi, USB guardada y USB nueva. */
export default function PrinterEditor({
  address,
  connection,
  initialName,
  initialRole,
  saving,
  error,
  onDelete,
  onSave,
  onCancel,
}: Props) {
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState(initialRole);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <p className="truncate font-mono text-xs text-even-evergreen/50">
        {connection === "usb" ? "USB" : "WiFi"} · {address}
      </p>
      <Input
        label="Nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ej. Barra, Cocina 1"
      />
      <div>
        <p className="mb-2 text-sm font-medium text-even-evergreen">
          ¿Qué imprime? (estación)
        </p>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={role === r.value}
              onClick={() => setRole(r.value)}
              className={cn(
                "min-h-11 cursor-pointer rounded-full px-4 text-xs font-medium uppercase tracking-wider ring-1 transition-colors",
                role === r.value
                  ? r.badge
                  : "bg-even-evergreen/5 text-even-evergreen/50 ring-even-evergreen/10 hover:bg-even-evergreen/10",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            aria-label="Eliminar impresora"
          >
            <Trash2 className="size-4" />
            Eliminar
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            size="sm"
            loading={saving}
            disabled={!role}
            onClick={() => onSave({ name: name.trim(), role })}
          >
            Guardar
          </Button>
        </div>
      </div>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="¿Eliminar impresora?"
        description={`${name || address} dejará de recibir tickets.`}
        footer={
          <>
            <Button variant="outline" fullWidth onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              variant="secondary"
              fullWidth
              loading={deleting}
              onClick={confirmDelete}
            >
              Eliminar
            </Button>
          </>
        }
      />
    </Card>
  );
}

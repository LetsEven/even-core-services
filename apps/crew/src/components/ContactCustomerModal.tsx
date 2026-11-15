import { useState } from "react";
import { ChevronLeft, Check } from "lucide-react";
import { Button, Modal } from "@even/ui";

interface Props {
  customerName: string;
  phone: string;
  onClose: () => void;
}

const CONTACT_REASONS = [
  "Confirmar el pedido",
  "Falta un ingrediente",
  "Platillo agotado",
  "Retraso en la preparación",
  "Otro",
];

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("52"))
    return `+52 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return phone;
}

export default function ContactCustomerModal({
  customerName,
  phone,
  onClose,
}: Props) {
  const [reason, setReason] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title="Contactar cliente"
      description={customerName}
      footer={
        <Button variant="outline" fullWidth onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {!reason ? (
          <>
            <p className="text-xs font-medium uppercase tracking-widest text-tone-600">
              ¿Cuál es el motivo?
            </p>
            <div className="overflow-hidden rounded-lg border border-stroke-soft">
              {CONTACT_REASONS.map((r, idx) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`min-h-11 w-full cursor-pointer px-4 py-3.5 text-left text-sm text-tone-700 transition-colors hover:bg-black/5 ${
                    idx > 0 ? "border-t border-stroke-soft" : ""
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => setReason(null)}
            >
              <ChevronLeft className="size-3.5" />
              Cambiar motivo
            </Button>

            <div className="flex items-center gap-2 rounded-lg border border-stroke-soft px-4 py-3">
              <Check className="size-4 shrink-0 text-even-evergreen" />
              <span className="text-sm text-tone-700">{reason}</span>
            </div>

            <div className="flex flex-col items-center gap-2 rounded-lg bg-even-grass/20 py-6">
              <p className="text-2xl font-bold tracking-wide text-even-evergreen">
                {formatPhone(phone)}
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

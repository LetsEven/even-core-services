import { useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, Check } from "lucide-react";

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-t-lg sm:rounded-lg overflow-hidden flex flex-col border border-white/10 shadow-2xl"
        style={{ background: "#023828", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8 shrink-0"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div>
            <p className="text-even-offwhite/40 text-xs uppercase tracking-widest mb-0.5">
              {customerName}
            </p>
            <h2 className="text-even-offwhite font-bold text-xl leading-none">
              Contactar cliente
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-even-offwhite/30 hover:text-even-offwhite hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-4">
          {!reason ? (
            <>
              <p className="text-xs uppercase tracking-widest text-even-offwhite/60 font-medium">
                ¿Cuál es el motivo?
              </p>
              <div
                className="rounded-lg border border-white/8 overflow-hidden"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                {CONTACT_REASONS.map((r, idx) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`w-full text-left px-4 py-3.5 text-sm text-even-offwhite/80 hover:bg-white/5 transition-colors cursor-pointer ${
                      idx > 0 ? "border-t border-white/8" : ""
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setReason(null)}
                className="flex items-center gap-1 text-xs text-even-offwhite/40 hover:text-even-offwhite/70 transition-colors cursor-pointer w-fit"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Cambiar motivo
              </button>

              <div
                className="rounded-lg border border-white/8 px-4 py-3 flex items-center gap-2"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <Check className="w-4 h-4 text-even-grass shrink-0" />
                <span className="text-sm text-even-offwhite/80">{reason}</span>
              </div>

              <div
                className="rounded-lg border border-even-grass/20 py-6 flex flex-col items-center gap-2"
                style={{ background: "rgba(52,211,153,0.08)" }}
              >
                <p className="text-2xl font-bold text-even-grass tracking-wide">
                  {formatPhone(phone)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

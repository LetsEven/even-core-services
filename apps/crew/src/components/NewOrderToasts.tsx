import { Check } from "lucide-react";
import { formatFolio } from "../utils/folio";

export interface OrderNotif {
  id: string;
  folio: string | number | null;
  customerName: string | null;
  identifier: string;
  orderedBy: string | null;
  title?: string;
}

interface Props {
  notifications: OrderNotif[];
  onDismiss: (id: string) => void;
}

// Deck de toasts de "nueva orden" — vive a nivel de App (no dentro de
// Kitchen) para que los 5 servicios lo compartan, no solo Pick & Go.
export default function NewOrderToasts({ notifications, onDismiss }: Props) {
  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{ width: "18.75rem" }}
    >
      {notifications.map((n, depth) => {
        if (depth > 2) return null;
        const folioPart = n.folio != null ? `#${formatFolio(n.folio)}` : null;
        const subtitle = [
          folioPart,
          n.identifier || null,
          n.customerName || null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div
            key={n.id}
            className="absolute inset-x-0 top-0 bg-even-evergreen/90 backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.6)] rounded-lg px-4 py-3 flex items-center gap-3"
            style={{
              zIndex: 50 - depth,
              transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.05})`,
              transformOrigin: "top center",
              transition: "transform 0.3s ease",
              pointerEvents: depth === 0 ? "auto" : "none",
            }}
          >
            <div className="relative shrink-0 w-3 h-3 flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-even-grass opacity-60 animate-ping" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-even-grass" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-even-offwhite font-semibold text-sm leading-tight">
                {n.title ?? "Nueva orden recibida"}
              </p>
              {subtitle && (
                <p className="text-even-offwhite/60 text-xs mt-0.5 leading-tight">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="w-px self-stretch bg-white/15 mx-1 shrink-0" />
            <button
              onClick={() => onDismiss(n.id)}
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-even-grass hover:bg-even-grass/90 transition-colors cursor-pointer shadow-sm"
              title="Dismiss"
            >
              <Check className="w-3.5 h-3.5 text-gray-800" strokeWidth={2.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

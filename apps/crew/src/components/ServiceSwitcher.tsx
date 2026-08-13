import type { OrderType } from "../types";
import { ORDER_TYPE_LABELS } from "../services/serviceMapping";

interface Props {
  activeOrderTypes: OrderType[];
  selected: OrderType;
  onSelect: (type: OrderType) => void;
}

// Solo se muestra cuando la sucursal tiene 2+ servicios contratados (caso
// raro — la mayoría tiene 1). Deja elegir cuál pantalla principal ver; los
// datos/socket son los mismos para todos, solo cambia qué HomeScreen se
// renderiza (ver App.tsx).
export default function ServiceSwitcher({
  activeOrderTypes,
  selected,
  onSelect,
}: Props) {
  if (activeOrderTypes.length <= 1) return null;

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-center gap-2 px-4 py-2 border-b border-white/10 overflow-x-auto no-scrollbar"
      style={{ background: "#011f16" }}
    >
      {activeOrderTypes.map((type) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          className={`shrink-0 text-[11px] px-3 py-1.5 rounded-md font-medium uppercase tracking-wider transition-colors cursor-pointer border ${
            type === selected
              ? "bg-even-grass border-even-grass text-even-evergreen"
              : "bg-white/5 border-white/10 text-even-offwhite/50 hover:bg-white/10 hover:text-even-offwhite/70"
          }`}
        >
          {ORDER_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}

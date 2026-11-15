import { useCaja } from "../../features/caja/context";
import { FIXED_FILTERS, monthLabel } from "../../features/caja/dateRange";
import SummaryCards from "../../features/caja/SummaryCards";

// Resumen del periodo elegido en los filtros compartidos de Caja.
export default function ResumenPage() {
  const { summary, filter, loading } = useCaja();
  const label =
    FIXED_FILTERS.find((f) => f.id === filter)?.label ?? monthLabel(filter);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
      <h2 className="text-sm uppercase tracking-wider text-even-evergreen/60">
        Resumen · {label}
        {loading && " · actualizando…"}
      </h2>
      <div className="rounded-lg bg-even-evergreen p-3">
        <SummaryCards summary={summary} />
      </div>
    </div>
  );
}

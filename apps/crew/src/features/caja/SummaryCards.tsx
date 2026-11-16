import { Banknote, CreditCard, Smartphone } from "lucide-react";
import { Card } from "@even/ui";
import { formatMoney, type DaySummary } from "./summary";

function Tile({
  label,
  value,
  icon,
  strong,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <Card
      variant="brand"
      padding="none"
      className="bg-white/10 px-3 py-2 min-w-0"
    >
      <p className="flex items-center gap-1 text-[0.6875rem] uppercase tracking-wider text-even-offwhite/60 truncate">
        {icon}
        {label}
      </p>
      <p
        className={
          strong
            ? "text-lg font-semibold text-even-grass tabular-nums truncate"
            : "text-base font-medium text-even-offwhite tabular-nums truncate"
        }
      >
        {formatMoney(value)}
      </p>
    </Card>
  );
}

export default function SummaryCards({ summary }: { summary: DaySummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <Tile label="Ventas" value={summary.sales} strong />
      <Tile label="Propinas" value={summary.tips} />
      <Tile
        label="Efectivo"
        value={summary.byMethod.cash}
        icon={<Banknote className="w-3 h-3" />}
      />
      <Tile
        label="Terminal"
        value={summary.byMethod.terminal}
        icon={<CreditCard className="w-3 h-3" />}
      />
      <Tile
        label="Digital"
        value={summary.byMethod.digital}
        icon={<Smartphone className="w-3 h-3" />}
      />
    </div>
  );
}

import { NavLink, Outlet, useLocation } from "react-router";
import { Search } from "lucide-react";
import { Input, cn } from "@even/ui";
import { useRegisterRefresh } from "../../app/refresh";
import { useSession } from "../../app/session/context";
import { useCajaData } from "../../features/caja/useCajaData";
import { FIXED_FILTERS, monthLabel } from "../../features/caja/dateRange";

const TABS = [
  { to: "/caja", label: "Órdenes", end: true },
  { to: "/caja/comprobantes", label: "Comprobantes", end: false },
  { to: "/caja/resumen", label: "Resumen", end: false },
];

const chip = (active: boolean) =>
  cn(
    "px-3 min-h-11 inline-flex items-center rounded-full text-xs uppercase tracking-wider transition-colors cursor-pointer",
    active
      ? "bg-even-grass text-even-evergreen font-medium"
      : "bg-white/10 text-even-offwhite/70 hover:bg-white/15",
  );

// Caja: tres vistas independientes (Órdenes, Comprobantes, Resumen) con periodo
// compartido; la búsqueda solo aplica a las listas.
export default function CajaLayout() {
  const { branchId, currentBranch, branchesLoading } = useSession();
  const data = useCajaData({
    branchId,
    restaurantId: currentBranch?.restaurant_id ?? null,
  });
  useRegisterRefresh(data.refresh, data.loading);

  const onResumen = useLocation().pathname.startsWith("/caja/resumen");
  const isMonth = !FIXED_FILTERS.some((f) => f.id === data.filter);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 px-4 pt-3 pb-3 flex flex-col gap-3">
        <div
          role="tablist"
          aria-label="Vistas de Caja"
          className="grid grid-cols-3 gap-1 p-1 rounded-full bg-white/5 border border-white/10"
        >
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              role="tab"
              className={({ isActive }) =>
                cn(chip(isActive), "justify-center px-2 truncate")
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FIXED_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => data.setFilter(f.id)}
              className={chip(data.filter === f.id)}
            >
              {f.label}
            </button>
          ))}
          {data.months.length > 0 && (
            <select
              aria-label="Mes"
              value={isMonth ? data.filter : ""}
              onChange={(e) => e.target.value && data.setFilter(e.target.value)}
              className={cn(chip(isMonth), "appearance-none pr-3")}
            >
              <option value="" className="text-even-evergreen">
                Mes
              </option>
              {data.months.map((ym) => (
                <option key={ym} value={ym} className="text-even-evergreen">
                  {monthLabel(ym)}
                </option>
              ))}
            </select>
          )}
          {!onResumen && (
            <Input
              type="search"
              aria-label="Buscar por mesa, folio o cliente"
              placeholder="Mesa, folio o cliente"
              value={data.query}
              onChange={(e) => data.setQuery(e.target.value)}
              leadingIcon={<Search className="w-4 h-4" />}
              containerClassName="ml-auto w-full sm:w-64"
              className="h-11 py-0 text-sm"
            />
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-t-lg bg-even-offwhite text-even-evergreen flex flex-col px-4 pt-4 pb-4 overflow-hidden">
        {branchesLoading ? (
          <Centered>
            <div className="w-8 h-8 border-4 border-even-evergreen/15 border-t-even-grass rounded-full animate-spin" />
          </Centered>
        ) : !branchId ? (
          <Centered>
            <p className="font-medium">Selecciona una sucursal</p>
            <p className="text-sm text-even-evergreen/60">
              Usa el selector de la barra superior.
            </p>
          </Centered>
        ) : (
          <Outlet context={data} />
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
      {children}
    </div>
  );
}

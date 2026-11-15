import { NavLink, Outlet } from "react-router";
import { cn } from "@even/ui";

const TABS = [
  { to: "/caja", label: "Historial", end: true },
  { to: "/caja/comprobantes", label: "Comprobantes", end: false },
];

// Caja: Historial y Comprobantes en pestañas.
export default function CajaLayout() {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div role="tablist" className="shrink-0 flex gap-2 px-4 pt-3 pb-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            role="tab"
            className={({ isActive }) =>
              cn(
                "px-4 min-h-9 inline-flex items-center rounded-full text-xs uppercase tracking-wider transition-colors",
                isActive
                  ? "bg-even-grass text-even-evergreen font-medium"
                  : "bg-white/10 text-even-offwhite/70 hover:bg-white/15",
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}

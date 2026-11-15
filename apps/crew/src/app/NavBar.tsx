import { NavLink } from "react-router";
import { cn } from "@even/ui";
import { NAV_DESTINATIONS } from "./nav";

// Barra inferior (<lg).
export default function NavBar() {
  return (
    <nav
      aria-label="Navegación principal"
      className="lg:hidden shrink-0 grid grid-cols-4 bg-even-evergreen border-t border-white/10"
    >
      {NAV_DESTINATIONS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 min-h-14 py-2 text-[0.6875rem] uppercase tracking-wider transition-colors",
              isActive
                ? "text-even-grass"
                : "text-even-offwhite/55 hover:text-even-offwhite",
            )
          }
        >
          <Icon className="w-5 h-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

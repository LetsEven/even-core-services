import { NavLink } from "react-router";
import { cn } from "@even/ui";
import { useNavDestinations } from "./nav";

// Barra inferior (<lg).
export default function NavBar() {
  const destinations = useNavDestinations();
  return (
    <nav
      aria-label="Navegación principal"
      className="lg:hidden shrink-0 grid bg-even-evergreen border-t border-white/10"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, destinations.length)}, minmax(0, 1fr))` }}
    >
      {destinations.map(({ to, label, icon: Icon }) => (
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

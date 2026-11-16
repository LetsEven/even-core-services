import { NavLink } from "react-router";
import { cn } from "@even/ui";
import { useNavDestinations } from "./nav";

// Rail lateral (lg+).
export default function NavRail() {
  const destinations = useNavDestinations();
  return (
    <nav
      aria-label="Navegación principal"
      className="hidden lg:flex shrink-0 w-24 flex-col items-stretch gap-1 py-4 bg-even-evergreen border-r border-white/10"
    >
      <img
        src="/even/even-asterisk-grass.svg"
        alt="Even"
        className="w-8 h-8 self-center mb-4"
      />
      {destinations.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "mx-2 flex flex-col items-center gap-1 rounded-xl py-3 text-[0.6875rem] uppercase tracking-wider transition-colors",
              isActive
                ? "bg-even-grass/15 text-even-grass"
                : "text-even-offwhite/55 hover:bg-white/5 hover:text-even-offwhite",
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

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { IconButton } from "@even/ui";

export interface AccountMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
}

// Menú "…" con las acciones secundarias de la cuenta.
export default function AccountMenu({ items }: { items: AccountMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <IconButton
        aria-label="Más acciones"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="size-5" />
      </IconButton>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-52 overflow-hidden rounded-2xl border border-even-evergreen/10 bg-white py-1 shadow-xl"
        >
          {items.map((it) => (
            <li key={it.key} role="none">
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className="min-h-11 w-full cursor-pointer px-4 text-left text-sm text-even-evergreen hover:bg-even-evergreen/5"
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { FlaskConical } from "lucide-react";

export const DEMO_BANNER_TEXT = "MODO DEMO: datos ficticios";

// Banner permanente: deja claro que nada de lo que se ve es real.
export default function DemoBanner() {
  return (
    <div
      role="status"
      className="shrink-0 flex items-center justify-center gap-2 bg-amber-400 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-black"
    >
      <FlaskConical className="size-3.5" aria-hidden />
      {DEMO_BANNER_TEXT}
    </div>
  );
}

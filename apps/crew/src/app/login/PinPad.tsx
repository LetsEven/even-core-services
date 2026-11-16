import { useEffect } from "react";
import { Delete } from "lucide-react";
import { Button, cn } from "@even/ui";
import { PIN_MIN, appendDigit } from "./loginLogic";

interface Props {
  value: string;
  onChange: (pin: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const keyClass =
  "min-h-20 rounded-2xl bg-white/10 text-even-offwhite text-3xl font-medium " +
  "active:bg-white/25 active:scale-95 transition disabled:opacity-40 " +
  "disabled:pointer-events-none cursor-pointer select-none touch-manipulation " +
  "focus-visible:outline-2 focus-visible:outline-even-grass";

// Teclado numerico grande y tactil. Tambien acepta el teclado fisico.
export default function PinPad({ value, onChange, onSubmit, disabled, loading }: Props) {
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) onChange(appendDigit(value, e.key));
      else if (e.key === "Backspace") onChange(value.slice(0, -1));
      else if (e.key === "Enter" && value.length >= PIN_MIN) onSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, disabled, onChange, onSubmit]);

  return (
    <div className="w-full max-w-xs flex flex-col items-center gap-6">
      {/* Puntos: el PIN nunca se muestra en claro. */}
      <div
        role="status"
        aria-label={`${value.length} dígitos ingresados`}
        className="flex h-6 items-center gap-3"
      >
        {Array.from({ length: Math.max(PIN_MIN, value.length) }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-4 rounded-full border-2 border-even-offwhite/50 transition-colors",
              i < value.length && "bg-even-grass border-even-grass",
            )}
          />
        ))}
      </div>

      <div className="grid w-full grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onChange(appendDigit(value, k))}
            className={keyClass}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          aria-label="Borrar"
          disabled={disabled || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
          className={cn(keyClass, "flex items-center justify-center")}
        >
          <Delete className="size-7" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(appendDigit(value, "0"))}
          className={keyClass}
        >
          0
        </button>
        <span aria-hidden />
      </div>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={loading}
        disabled={disabled || value.length < PIN_MIN}
        onClick={onSubmit}
      >
        Entrar
      </Button>
    </div>
  );
}

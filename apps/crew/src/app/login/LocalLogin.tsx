import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { Button, Input, Spinner } from "@even/ui";
import { ROLE_LABELS } from "../../lib/auth/roles";
import type { SelectorUser } from "../../lib/auth/localClient";
import { useLocalAuth } from "../../lib/auth/localContext";
import PinPad from "./PinPad";
import {
  DEFAULT_LOCKOUT_S,
  MAX_FAILURES,
  formatCountdown,
  isValidPin,
  loginErrorMessage,
  lockoutSeconds,
  pairingErrorMessage,
} from "./loginLogic";

const APP_LABEL = import.meta.env.VITE_APP_LABEL || "Even Crew";

function Frame({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-6 py-8"
      style={{ background: "#023828" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <img src="/even/even-asterisk-grass.svg" alt="Even" className="w-16 h-16" />
          <h1 className="text-even-offwhite text-2xl font-medium uppercase tracking-widest">
            {APP_LABEL}
          </h1>
          <p className="text-even-offwhite/60 text-xs uppercase tracking-widest text-center">
            {subtitle}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

// Primera vez en el dispositivo: codigo de emparejamiento (lo genera el gerente).
function PairingScreen() {
  const { pair } = useLocalAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      await pair(code);
    } catch (err) {
      setError(pairingErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <Frame subtitle="Empareja este dispositivo">
      <form onSubmit={submit} className="w-full flex flex-col gap-4">
        <p className="text-even-offwhite/70 text-sm text-center">
          Pide al gerente un código de emparejamiento (vale 10 minutos y se usa
          una vez).
        </p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Código de emparejamiento"
          placeholder="Código"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="h-14 text-center text-xl tracking-widest"
        />
        {error && (
          <p role="alert" className="text-rose-400 text-sm text-center">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={loading} disabled={!code.trim()}>
          Emparejar
        </Button>
      </form>
    </Frame>
  );
}

function UserPicker({ onPick }: { onPick: (u: SelectorUser) => void }) {
  const { listUsers } = useLocalAuth();
  const [users, setUsers] = useState<SelectorUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    listUsers()
      .then((u) => {
        if (alive) {
          setUsers(u);
          setFailed(false);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [listUsers, attempt]);

  const retry = () => {
    setFailed(false);
    setUsers(null);
    setAttempt((n) => n + 1);
  };

  return (
    <Frame subtitle="¿Quién eres?">
      {failed ? (
        <div className="flex flex-col items-center gap-3">
          <p role="alert" className="text-rose-400 text-sm text-center">
            No se pudo cargar la lista de usuarios.
          </p>
          <Button variant="light" size="sm" onClick={retry}>
            <RefreshCw className="size-4" /> Reintentar
          </Button>
        </div>
      ) : users === null ? (
        <Spinner className="text-even-grass" />
      ) : users.length === 0 ? (
        <p className="text-even-offwhite/70 text-sm text-center">
          Esta sucursal no tiene usuarios activos.
        </p>
      ) : (
        <ul className="w-full grid grid-cols-2 gap-3">
          {users.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onPick(u)}
                className="w-full min-h-24 rounded-2xl bg-white/10 px-3 py-4 text-even-offwhite active:bg-white/25 active:scale-95 transition cursor-pointer touch-manipulation flex flex-col items-center justify-center gap-1"
              >
                <span className="text-lg font-medium leading-tight break-words">
                  {u.name}
                </span>
                <span className="text-[0.6875rem] uppercase tracking-wider text-even-offwhite/55">
                  {ROLE_LABELS[u.role]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function PinScreen({ user, onBack }: { user: SelectorUser; onBack: () => void }) {
  const { login } = useLocalAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const failures = useRef(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lockedUntil === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) {
        setLockedUntil(null);
        failures.current = 0;
        setError("");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const lock = useCallback((seconds: number) => {
    const t = Date.now();
    setNow(t);
    setLockedUntil(t + seconds * 1000);
  }, []);

  const submit = useCallback(async () => {
    if (loading || lockedUntil !== null || !isValidPin(pin)) return;
    setLoading(true);
    setError("");
    try {
      await login(user.id, pin);
      // El guard del router detecta la sesion y redirige.
    } catch (err) {
      setPin("");
      setLoading(false);
      const wait = lockoutSeconds(err);
      if (wait !== null) {
        lock(wait);
        return;
      }
      failures.current += 1;
      if (failures.current >= MAX_FAILURES) {
        lock(DEFAULT_LOCKOUT_S);
        return;
      }
      setError(loginErrorMessage(err));
    }
  }, [loading, lockedUntil, pin, login, user.id, lock]);

  const locked = lockedUntil !== null;

  return (
    <Frame subtitle={user.name}>
      <PinPad
        value={pin}
        onChange={setPin}
        onSubmit={() => void submit()}
        disabled={locked}
        loading={loading}
      />
      <div className="min-h-10 text-center">
        {locked ? (
          <p role="alert" className="text-rose-400 text-sm">
            Demasiados intentos. Espera{" "}
            {formatCountdown(((lockedUntil ?? 0) - now) / 1000)} para volver a
            intentar.
          </p>
        ) : (
          error && (
            <p role="alert" className="text-rose-400 text-sm">
              {error}
            </p>
          )
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onBack} className="text-even-offwhite/70 hover:bg-white/10">
        <ChevronLeft className="size-4" /> Cambiar usuario
      </Button>
    </Frame>
  );
}

// Login local: emparejamiento (solo la primera vez) -> selector de empleados -> PIN.
export default function LocalLogin() {
  const { paired } = useLocalAuth();
  const [selected, setSelected] = useState<SelectorUser | null>(null);
  if (!paired) return <PairingScreen />;
  if (!selected) return <UserPicker onPick={setSelected} />;
  return <PinScreen user={selected} onBack={() => setSelected(null)} />;
}

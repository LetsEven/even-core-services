import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, QrCode, RefreshCw } from "lucide-react";
import { Badge, Button, Input } from "@even/ui";
import { ROLES, ROLE_LABELS, isRole, useAuth, type Role } from "../../lib/auth";
import type { AdminUser, PairingCode } from "../../lib/auth/localClient";
import { useLocalAuth } from "../../lib/auth/localContext";
import { PIN_MAX, PIN_MIN, isValidPin } from "../login/loginLogic";

const ACTION_ERROR = "No se pudo completar la acción. Intenta de nuevo.";

const selectClass =
  "min-h-11 rounded-lg border border-even-evergreen/20 bg-white px-2 text-sm text-even-evergreen";

function RoleSelect({
  value,
  onChange,
  label,
  disabled,
}: {
  value: Role;
  onChange: (r: Role) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => isRole(e.target.value) && onChange(e.target.value)}
      className={selectClass}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

// Administracion de usuarios y emparejamiento del servicio crew-auth. Solo se
// monta con provider local y permiso usuarios.administrar (ver AjustesPage); el
// servicio vuelve a exigir rol super en cada llamada.
export default function LocalUsersAdmin() {
  const { client, branchId } = useLocalAuth();
  const { getToken, user: me } = useAuth();

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<PairingCode | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("mesero");
  const [newPin, setNewPin] = useState("");

  // Ejecuta una llamada autenticada; los errores se muestran sin detalle.
  const run = useCallback(
    async <T,>(fn: (token: string, branch: string) => Promise<T>): Promise<T | null> => {
      try {
        const token = await getToken();
        if (!token || !branchId) throw new Error("sin sesión");
        return await fn(token, branchId);
      } catch {
        setError(ACTION_ERROR);
        return null;
      }
    },
    [getToken, branchId],
  );

  const load = useCallback(async () => {
    const list = await run((t, b) => client.adminListUsers(t, b));
    if (list) setUsers(list);
  }, [run, client]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getToken();
        if (!token || !branchId) throw new Error("sin sesión");
        const list = await client.adminListUsers(token, branchId);
        if (alive) setUsers(list);
      } catch {
        if (alive) setError(ACTION_ERROR);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getToken, branchId, client]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    await fn();
    setBusy(false);
  };

  const patch = (u: AdminUser, p: { role?: Role; active?: boolean }) =>
    act(async () => {
      const updated = await run((t) => client.adminUpdateUser(t, u.id, p));
      if (updated) setUsers((all) => all?.map((x) => (x.id === u.id ? updated : x)) ?? null);
    });

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !isValidPin(newPin)) return;
    void act(async () => {
      const created = await run((t, b) =>
        client.adminCreateUser(t, { branchId: b, name: newName.trim(), role: newRole, pin: newPin }),
      );
      if (created) {
        setUsers((all) => [...(all ?? []), created]);
        setNewName("");
        setNewPin("");
      }
    });
  };

  const doReset = (u: AdminUser) =>
    act(async () => {
      const ok = await run(async (t) => {
        await client.adminResetPin(t, u.id, resetPin);
        return true;
      });
      if (ok) {
        setResetFor(null);
        setResetPin("");
      }
    });

  const genCode = () =>
    act(async () => {
      const c = await run((t, b) => client.adminCreatePairingCode(t, b));
      if (c) setCode(c);
    });

  return (
    <section
      aria-label="Usuarios del servicio local"
      className="flex flex-col gap-3 rounded-xl bg-white border border-even-evergreen/10 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wider">Usuarios</h2>
        <Button variant="ghost" size="sm" aria-label="Recargar usuarios" onClick={() => { setError(""); void load(); }}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      {users === null ? (
        <p className="text-sm text-even-evergreen/60">Cargando…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-even-evergreen/10">
          {users.map((u) => {
            const isMe = u.id === me?.id;
            return (
              <li key={u.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-0 truncate font-medium">{u.name}</span>
                  {!u.active && <Badge size="sm" variant="neutral">Inactivo</Badge>}
                  <RoleSelect
                    label={`Rol de ${u.name}`}
                    value={u.role}
                    disabled={busy || isMe}
                    onChange={(role) => void patch(u, { role })}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || isMe}
                    onClick={() => void patch(u, { active: !u.active })}
                  >
                    {u.active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setResetFor(resetFor === u.id ? null : u.id);
                      setResetPin("");
                    }}
                  >
                    <KeyRound className="size-4" /> Resetear PIN
                  </Button>
                </div>
                {resetFor === u.id && (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (isValidPin(resetPin)) void doReset(u);
                    }}
                  >
                    <Input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={`Nuevo PIN de ${u.name}`}
                      placeholder={`Nuevo PIN (${PIN_MIN}-${PIN_MAX} dígitos)`}
                      value={resetPin}
                      maxLength={PIN_MAX}
                      onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ""))}
                      containerClassName="flex-1 min-w-40"
                      className="h-11 py-0 text-sm"
                    />
                    <Button type="submit" size="sm" disabled={busy || !isValidPin(resetPin)}>
                      Guardar PIN
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={create} className="flex flex-col gap-2 border-t border-even-evergreen/10 pt-3">
        <h3 className="text-xs uppercase tracking-wider text-even-evergreen/60">Nuevo usuario</h3>
        <Input
          aria-label="Nombre"
          placeholder="Nombre"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-11 py-0 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <RoleSelect label="Rol" value={newRole} onChange={setNewRole} />
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            aria-label="PIN"
            placeholder={`PIN (${PIN_MIN}-${PIN_MAX} dígitos)`}
            value={newPin}
            maxLength={PIN_MAX}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            containerClassName="flex-1 min-w-40"
            className="h-11 py-0 text-sm"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="self-start"
          disabled={busy || !newName.trim() || !isValidPin(newPin)}
        >
          <Plus className="size-4" /> Crear usuario
        </Button>
      </form>

      <div className="flex flex-col gap-2 border-t border-even-evergreen/10 pt-3">
        <Button variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => void genCode()}>
          <QrCode className="size-4" /> Generar código de emparejamiento
        </Button>
        {code && (
          <p className="text-sm" role="status">
            Código: <span className="font-mono text-2xl font-semibold tracking-widest">{code.code}</span>
            <span className="block text-xs text-even-evergreen/60">
              Vale 10 minutos y se usa una sola vez.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

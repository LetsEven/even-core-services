import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldOff } from "lucide-react";
import { Badge, Button } from "@even/ui";
import { useAuth } from "../../lib/auth";
import type { AdminDevice } from "../../lib/auth/localClient";
import { useLocalAuth } from "../../lib/auth/localContext";

const ACTION_ERROR = "No se pudo completar la acción. Intenta de nuevo.";

const fmt = (ms: number | null) =>
  ms === null
    ? "sin uso"
    : new Date(ms).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

// Dispositivos vinculados al restaurante y revocacion (un equipo robado o
// perdido deja de poder entrar y pierde sus sesiones). Solo se monta con
// provider local y permiso usuarios.administrar (ver AjustesPage); el servicio
// vuelve a exigir rol super.
export default function LocalDevicesAdmin() {
  const { client } = useLocalAuth();
  const { getToken } = useAuth();

  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("sin sesión");
      setDevices(await client.adminListDevices(token));
    } catch {
      setError(ACTION_ERROR);
    }
  }, [getToken, client]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("sin sesión");
        const list = await client.adminListDevices(token);
        if (alive) setDevices(list);
      } catch {
        if (alive) setError(ACTION_ERROR);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getToken, client]);

  const revoke = async (d: AdminDevice) => {
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("sin sesión");
      await client.adminRevokeDevice(token, d.id);
      setDevices((all) => all?.filter((x) => x.id !== d.id) ?? null);
      setConfirming(null);
    } catch {
      setError(ACTION_ERROR);
    }
    setBusy(false);
  };

  return (
    <section
      aria-label="Dispositivos vinculados"
      className="flex flex-col gap-3 rounded-xl bg-white border border-even-evergreen/10 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wider">Equipos vinculados</h2>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Recargar dispositivos"
          onClick={() => {
            setError("");
            void load();
          }}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      {devices === null ? (
        !error && <p className="text-sm text-even-evergreen/60">Cargando…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-even-evergreen/60">No hay equipos vinculados.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-even-evergreen/10">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-3">
              <span className="flex-1 min-w-0">
                <span className="block truncate font-medium">{d.name}</span>
                <span className="block text-xs text-even-evergreen/60">
                  Último uso: {fmt(d.lastSeenAt)}
                </span>
              </span>
              {d.current ? (
                <Badge size="sm" variant="neutral">Este equipo</Badge>
              ) : confirming === d.id ? (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    aria-label={`Confirmar revocar ${d.name}`}
                    onClick={() => void revoke(d)}
                    className="bg-danger-600 text-white"
                  >
                    Confirmar
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(null)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label={`Revocar ${d.name}`}
                  onClick={() => setConfirming(d.id)}
                  className="border-danger-600 text-danger-600"
                >
                  <ShieldOff className="size-4" /> Revocar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

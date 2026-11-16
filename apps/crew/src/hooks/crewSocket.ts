import { io, type Socket } from "socket.io-client";
import type { AuthKind } from "../lib/auth";

export interface CrewSocketOptions {
  url: string;
  branchId: string;
  deviceId: string;
  platform: "web" | "native";
  kind: AuthKind;
  /** Access token vigente (null sin sesion). Se pide en cada (re)conexion. */
  getToken: () => Promise<string | null>;
  /** VITE_CREW_SOCKET_SECRET; solo se usa como fallback legado con clerk. */
  legacySecret?: string;
}

/**
 * Secreto compartido del handshake: solo fallback legado (backends que aun no
 * aceptan auth.token), solo con provider clerk y solo si el build lo define.
 * Nunca con local ni demo.
 */
export function legacySecretFor(
  kind: AuthKind,
  secret: string | undefined,
): string | undefined {
  if (kind !== "clerk") return undefined;
  return secret ? secret : undefined;
}

/**
 * Abre el socket de Crew autenticado con token por conexion. `auth` es una
 * funcion: cada reconexion pide un token nuevo. Sin sesion se cierra el
 * socket. Al recibir `auth_expired` (el servidor desconecta y socket.io no
 * reintenta solo) o un rechazo por token, renueva y reconecta.
 */
export function openCrewSocket(opts: CrewSocketOptions): {
  socket: Socket;
  /** Cierre definitivo (cleanup): cancela reintentos pendientes. */
  stop: () => void;
} {
  const secret = legacySecretFor(opts.kind, opts.legacySecret);
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const socket: Socket = io(opts.url, {
    auth: (cb) => {
      opts
        .getToken()
        .then((token) => {
          if (closed) return;
          if (!token) {
            // Sin sesion no hay nada que autenticar: cerrar.
            socket.disconnect();
            return;
          }
          cb({
            clientType: "crew",
            token,
            branchId: opts.branchId,
            deviceId: opts.deviceId,
            platform: opts.platform,
            ...(secret ? { secret } : {}),
          });
        })
        .catch(() => {
          socket.disconnect();
        });
    },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  const renewAndReconnect = () => {
    if (closed) return;
    // El servidor ya cerro; asegura estado limpio y vuelve a conectar: la
    // funcion auth pedira el token nuevo (o cerrara si no hay sesion).
    socket.disconnect();
    socket.connect();
  };

  socket.on("auth_expired", renewAndReconnect);

  socket.on("connect_error", (err: Error) => {
    // Un rechazo del middleware no dispara la reconexion automatica.
    if (closed || !/token/i.test(err.message)) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(renewAndReconnect, 5000);
  });

  const stop = () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket.disconnect();
  };

  return { socket, stop };
}

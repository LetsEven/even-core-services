"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";

export interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  /** Entra a la sala de la mesa (`join:{eventPrefix}`). */
  join: (tableNumber: string) => void;
  /** Sale de la sala de la mesa (`leave:{eventPrefix}`). */
  leave: (tableNumber: string) => void;
}

export interface SocketIdentity {
  user: unknown;
  authLoading: boolean;
  guestId: string | null;
  guestName: string | null;
  isGuest: boolean;
}

export interface SocketScope {
  restaurantId?: string | number | null;
  branchNumber?: string | number | null;
}

export interface SocketRoomPayload {
  restaurantId: string | number;
  branchNumber: string | number;
}

export interface SocketProviderConfig {
  /** `auth.clientType` del handshake: lo usa el backend para saber qué app se conecta. */
  clientType: string;
  /** Prefijo de los eventos de sala: `table` (FlexBill) o `tappay` (Tap & Pay). */
  eventPrefix: string;
  /** Nombre de la app en los logs de conexión. */
  appLabel: string;
  /** Nombre de la sala en el log de errores del socket. */
  roomLabel: string;
  /** Si el backend emite `{prefix}:user-joined` / `{prefix}:user-left` y la app los escucha (sin efecto). */
  listenUserEvents: boolean;
  /** Credenciales de la app (`useAuth` + `useGuest`). */
  useIdentity: () => SocketIdentity;
  /** Restaurante y sucursal actuales (`useRestaurant`). */
  useScope: () => SocketScope;
  /** Cómo viajan restaurante y sucursal en `join`/`leave` (cada app tiene su valor por defecto de sucursal). */
  toRoomPayload: (scope: {
    restaurantId: string | number;
    branchNumber?: string | number | null;
  }) => SocketRoomPayload;
}

// Socket.IO necesita la URL base sin /api
const getSocketUrl = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  // Remover /api si está presente al final
  return apiUrl.replace(/\/api\/?$/, "");
};

/** Crea `SocketProvider` y `useSocketContext` (conexión Socket.IO con reconexión a la sala de la mesa). */
export function createSocketProvider(config: SocketProviderConfig) {
  const {
    clientType,
    eventPrefix,
    appLabel,
    roomLabel,
    listenUserEvents,
    useIdentity,
    useScope,
    toRoomPayload,
  } = config;
  const SOCKET_URL = getSocketUrl();
  const SocketContext = createContext<SocketContextType | undefined>(undefined);

  function SocketProvider({ children }: { children: React.ReactNode }) {
    const { user, authLoading, guestId, guestName, isGuest } = useIdentity();
    const { restaurantId, branchNumber } = useScope();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const currentRoom = useRef<string | null>(null);

    // Inicializar socket cuando hay credenciales disponibles
    useEffect(() => {
      // Esperar a que auth cargue
      if (authLoading) return;

      // Necesitamos guestId (invitado) o user (autenticado)
      const hasCredentials = isGuest ? !!guestId : !!user;

      if (!hasCredentials) {
        // Sin credenciales, desconectar si hay socket
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
          setSocket(null);
          setIsConnected(false);
        }
        return;
      }

      // Si ya hay un socket conectado, no crear otro
      if (socketRef.current?.connected) {
        return;
      }

      const initSocket = async () => {
        try {
          // Preparar auth según tipo de usuario
          const authPayload: Record<string, unknown> = {
            clientType,
          };

          if (isGuest && guestId) {
            // Usuario invitado
            authPayload.guestId = guestId;
            authPayload.guestName = guestName || "Invitado";
          } else if (user) {
            // Usuario autenticado - token de localStorage
            const token = localStorage.getItem("even-auth-token");
            if (token) {
              authPayload.token = token;
            } else {
              // Fallback a guest si no hay token
              authPayload.guestId = guestId || `guest-${Date.now()}`;
              authPayload.guestName = guestName || "Invitado";
            }
          }

          const newSocket = io(SOCKET_URL, {
            auth: authPayload,
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
          });

          newSocket.on("connect", () => {
            setIsConnected(true);

            // Reconectar a la sala de la mesa si estaba en una
            if (currentRoom.current) {
              const [, restId, branch, table] = currentRoom.current.split(":");
              newSocket.emit(`join:${eventPrefix}`, {
                restaurantId: restId,
                branchNumber: branch,
                tableNumber: table,
              });
            }
          });

          newSocket.on("disconnect", () => {
            setIsConnected(false);
          });

          newSocket.on(`${eventPrefix}:joined`, (data) => {
            currentRoom.current = data.roomName;
          });

          newSocket.on(`${eventPrefix}:left`, () => {
            currentRoom.current = null;
          });

          if (listenUserEvents) {
            newSocket.on(`${eventPrefix}:user-joined`, () => {});
            newSocket.on(`${eventPrefix}:user-left`, () => {});
          }

          newSocket.on(`${eventPrefix}:error`, (error) => {
            console.error(`⚠️ ${roomLabel} socket error:`, error);
          });

          newSocket.on("connect_error", (error) => {
            console.error(
              `❌ ${appLabel} Socket connect error:`,
              error.message,
            );
            setIsConnected(false);
          });

          socketRef.current = newSocket;
          setSocket(newSocket);
        } catch (error) {
          console.error(`❌ Error initializing ${appLabel} socket:`, error);
        }
      };

      initSocket();

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }, [authLoading, user, isGuest, guestId, guestName]);

    const join = useCallback(
      (tableNumber: string) => {
        if (socketRef.current && isConnected && restaurantId) {
          socketRef.current.emit(`join:${eventPrefix}`, {
            ...toRoomPayload({ restaurantId, branchNumber }),
            tableNumber,
          });
        }
      },
      [isConnected, restaurantId, branchNumber],
    );

    const leave = useCallback(
      (tableNumber: string) => {
        if (socketRef.current && isConnected && restaurantId) {
          socketRef.current.emit(`leave:${eventPrefix}`, {
            ...toRoomPayload({ restaurantId, branchNumber }),
            tableNumber,
          });
          currentRoom.current = null;
        }
      },
      [isConnected, restaurantId, branchNumber],
    );

    return (
      <SocketContext.Provider
        value={{
          socket,
          isConnected,
          join,
          leave,
        }}
      >
        {children}
      </SocketContext.Provider>
    );
  }

  function useSocketContext() {
    const context = useContext(SocketContext);
    if (context === undefined) {
      throw new Error("useSocketContext must be used within a SocketProvider");
    }
    return context;
  }

  return { SocketProvider, useSocketContext };
}

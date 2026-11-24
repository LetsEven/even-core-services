"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { retailService } from "@/app/services/retail.service";
import type { RetailOrder } from "@/app/types/order";

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000").replace(
  /\/api\/?$/,
  "",
);
// Respaldo por si el socket se cae (p. ej. el teléfono suspendió la pestaña)
const POLL_MS = 15_000;
const RETAIL_EVENTS = [
  "retail:order_created",
  "retail:order_updated",
  "retail:order_paid",
  "retail:order_cancelled",
];

interface RetailOrderContextValue {
  order: RetailOrder | null;
  loading: boolean;
  error: string | null;
  // La orden que tenía la pantalla ya no está activa (otro la pagó o crew la canceló)
  lastClosed: RetailOrder["status"] | null;
  reload: () => Promise<RetailOrder | null>;
}

const RetailOrderContext = createContext<RetailOrderContextValue | undefined>(undefined);

export function RetailOrderProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const restaurantId = params?.restaurantId as string | undefined;
  const branchNumber = params?.branchNumber as string | undefined;

  const [order, setOrder] = useState<RetailOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastClosed, setLastClosed] = useState<RetailOrder["status"] | null>(null);
  const orderRef = useRef<RetailOrder | null>(null);

  const reload = useCallback(async () => {
    if (!restaurantId || !branchNumber) return null;
    try {
      const next = await retailService.getActiveOrder(restaurantId, branchNumber);
      const prev = orderRef.current;
      if (prev && (!next || next.id !== prev.id)) {
        // La orden que se veía se cerró: saber si fue pagada o cancelada
        const closed = await retailService.getOrder(prev.id).catch(() => null);
        setLastClosed(closed?.status ?? null);
      } else if (next) {
        setLastClosed(null);
      }
      orderRef.current = next;
      setOrder(next);
      setError(null);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      return orderRef.current;
    } finally {
      setLoading(false);
    }
  }, [restaurantId, branchNumber]);

  useEffect(() => {
    if (!restaurantId || !branchNumber) return;
    reload();

    const socket: Socket = io(SOCKET_URL, {
      auth: { clientType: "retail" },
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    const join = () => socket.emit("join:retail", { restaurantId, branchNumber });
    socket.on("connect", () => {
      join();
      reload();
    });
    for (const event of RETAIL_EVENTS) socket.on(event, () => reload());

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, POLL_MS);

    return () => {
      clearInterval(poll);
      socket.emit("leave:retail");
      socket.disconnect();
    };
  }, [restaurantId, branchNumber, reload]);

  return (
    <RetailOrderContext.Provider value={{ order, loading, error, lastClosed, reload }}>
      {children}
    </RetailOrderContext.Provider>
  );
}

export function useRetailOrder() {
  const ctx = useContext(RetailOrderContext);
  if (!ctx) throw new Error("useRetailOrder debe usarse dentro de RetailOrderProvider");
  return ctx;
}

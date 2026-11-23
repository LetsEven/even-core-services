"use client";

import { createContext, useContext, useState, useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";

export interface PepperMessage {
  id: string;
  role: "user" | "pepper";
  content: string;
}

interface PepperContextValue {
  messages: PepperMessage[];
  setMessages: Dispatch<SetStateAction<PepperMessage[]>>;
  sessionId: string | null;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  hasStartedChat: boolean;
  setHasStartedChat: Dispatch<SetStateAction<boolean>>;
}

const PepperContext = createContext<PepperContextValue | null>(null);

/**
 * Conversación con Pepper compartida entre el chat y el dashboard. `resetKey` es el restaurante
 * actual: al cambiar, la conversación se reinicia (el provider de cada app se lo pasa).
 */
export function PepperProvider({ resetKey, children }: { resetKey: string | number | null; children: ReactNode }) {
  const [messages, setMessages] = useState<PepperMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasStartedChat, setHasStartedChat] = useState(false);

  const prevKey = useRef(resetKey);

  useEffect(() => {
    if (prevKey.current !== null && prevKey.current !== resetKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- se reinicia la conversación al cambiar de restaurante
      setMessages([]);
      setSessionId(null);
      setHasStartedChat(false);
    }
    prevKey.current = resetKey;
  }, [resetKey]);

  return (
    <PepperContext.Provider
      value={{ messages, setMessages, sessionId, setSessionId, hasStartedChat, setHasStartedChat }}
    >
      {children}
    </PepperContext.Provider>
  );
}

export function usePepper() {
  const ctx = useContext(PepperContext);
  if (!ctx) throw new Error("usePepper must be used inside PepperProvider");
  return ctx;
}

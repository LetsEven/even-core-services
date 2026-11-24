"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./AuthContext";

interface GuestContextType {
  isGuest: boolean;
  guestId: string | null;
  guestName: string | null;
  setAsGuest: () => void;
  setAsAuthenticated: (userId: string) => void;
  clearGuestSession: () => void;
  setGuestName: (name: string) => void;
}

const GuestContext = createContext<GuestContextType | undefined>(undefined);

const GUEST_ID_KEY = "even-guest-id";
const GUEST_NAME_KEY = "even-guest-name";

function storedGuestId(): string {
  let id = localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

// Retail no tiene mesa: sin sesión, el comensal siempre es invitado con un id estable
export function GuestProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState(false);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [guestName, setGuestNameState] = useState<string | null>(null);
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      setIsGuest(false);
      setGuestId(null);
      return;
    }
    setIsGuest(true);
    setGuestId(storedGuestId());
    setGuestNameState(localStorage.getItem(GUEST_NAME_KEY));
  }, [isLoading, user]);

  const setAsGuest = () => {
    setIsGuest(true);
    setGuestId(storedGuestId());
  };

  // El guest_id se conserva: PaymentContext lo usa para migrar las tarjetas
  const clearGuestSession = () => {
    setIsGuest(false);
    setGuestId(null);
    setGuestNameState(null);
    localStorage.removeItem(GUEST_NAME_KEY);
  };

  const setGuestName = (name: string) => {
    setGuestNameState(name);
    localStorage.setItem(GUEST_NAME_KEY, name);
  };

  return (
    <GuestContext.Provider
      value={{
        isGuest,
        guestId,
        guestName,
        setAsGuest,
        setAsAuthenticated: () => clearGuestSession(),
        clearGuestSession,
        setGuestName,
      }}
    >
      {children}
    </GuestContext.Provider>
  );
}

export function useGuest(): GuestContextType {
  const context = useContext(GuestContext);
  if (context === undefined) {
    throw new Error("useGuest must be used within a GuestProvider");
  }
  return context;
}

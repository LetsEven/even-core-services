"use client";

import type { ComponentProps } from "react";
import { SupportTab as SharedSupportTab } from "@even/ui/diner";
import { useAuth } from "../../context/AuthContext";
import { useRoom } from "../../context/RoomContext";

type Props = Omit<ComponentProps<typeof SharedSupportTab>, "userId" | "userName" | "contextExtras">;

/** Chat de soporte del dashboard (en `@even/ui/diner`); aquí solo se le pasa el usuario y el contexto del servicio. */
export default function SupportTab(props: Props) {
  const { user, profile } = useAuth();
  const { state } = useRoom();
  const userName =
    profile?.firstName && profile?.lastName ? `${profile.firstName} ${profile.lastName}` : profile?.firstName || null;
  return (
    <SharedSupportTab {...props} userId={user?.id || null} userName={userName} contextExtras={`room_number=${state.roomNumber || "null"}`} />
  );
}

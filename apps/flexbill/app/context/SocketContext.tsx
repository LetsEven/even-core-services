"use client";

import { createSocketProvider } from "@even/realtime";
import { useGuest } from "./GuestContext";
import { useAuth } from "./AuthContext";
import { useRestaurant } from "./RestaurantContext";

const { SocketProvider, useSocketContext: useBaseSocketContext } =
  createSocketProvider({
    clientType: "flexbill",
    eventPrefix: "table",
    appLabel: "FlexBill",
    roomLabel: "Table",
    listenUserEvents: true,
    useIdentity: () => {
      const { user, isLoading: authLoading } = useAuth();
      const { guestId, guestName, isGuest } = useGuest();
      return { user, authLoading, guestId, guestName, isGuest };
    },
    useScope: useRestaurant,
    toRoomPayload: ({ restaurantId, branchNumber }) => ({
      restaurantId: restaurantId.toString(),
      branchNumber: branchNumber?.toString() || "main",
    }),
  });

export { SocketProvider };

export function useSocketContext() {
  const { socket, isConnected, join, leave } = useBaseSocketContext();
  return { socket, isConnected, joinTable: join, leaveTable: leave };
}

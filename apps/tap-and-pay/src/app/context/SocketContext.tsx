"use client";

import { createSocketProvider } from "@even/realtime";
import { useGuest } from "./GuestContext";
import { useAuth } from "./AuthContext";
import { useRestaurant } from "./RestaurantContext";

const { SocketProvider, useSocketContext: useBaseSocketContext } =
  createSocketProvider({
    clientType: "tap-pay",
    eventPrefix: "tappay",
    appLabel: "TapPay",
    roomLabel: "TapPay",
    listenUserEvents: false,
    useIdentity: () => {
      const { user, isLoading: authLoading } = useAuth();
      const { guestId, guestName, isGuest } = useGuest();
      return { user, authLoading, guestId, guestName, isGuest };
    },
    useScope: () => {
      const { params } = useRestaurant();
      return {
        restaurantId: params?.restaurantId,
        branchNumber: params?.branchNumber,
      };
    },
    toRoomPayload: ({ restaurantId, branchNumber }) => ({
      restaurantId,
      branchNumber: branchNumber || "1",
    }),
  });

export { SocketProvider };

export function useSocketContext() {
  const { socket, isConnected, join, leave } = useBaseSocketContext();
  return { socket, isConnected, joinTapPay: join, leaveTapPay: leave };
}

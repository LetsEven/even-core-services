import { createAuthService } from "@even/auth";
export type { AuthResponse, ProfileData, TermsStatus } from "@even/auth";

export const authService = createAuthService({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  termsSource: "room-service",
  refreshSingleFlight: "refresh-token",
  retryProfileUpdateOnUnauthorized: false,
  clearExpiresAtOnLogout: false,
  clearSessionStorageKeys: ["pendingRoomRedirect", "pendingRestaurantId", "authFromPaymentFlow", "authFromMenu"],
  clearLocalStorageKeys: ["even-guest-id", "even-room-number", "even-restaurant-id"],
});

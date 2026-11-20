import { createAuthService } from "@even/auth";
export type { AuthResponse, ProfileData, TermsStatus } from "@even/auth";

export const authService = createAuthService({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  termsSource: "tap-and-pay",
  refreshSingleFlight: "handle-token-refresh",
  retryProfileUpdateOnUnauthorized: false,
  clearExpiresAtOnLogout: false,
  clearSessionStorageKeys: ["pendingRoomRedirect", "authFromPaymentFlow", "authFromMenu", "pendingRestaurantId"],
  clearLocalStorageKeys: ["even-guest-id", "even-room-number", "even-restaurant-id"],
});

import { createAuthService } from "@even/auth";
export type { AuthResponse, ProfileData, TermsStatus } from "@even/auth";

export const authService = createAuthService({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  termsSource: "tap-order-and-pay",
  refreshSingleFlight: "refresh-token",
  retryProfileUpdateOnUnauthorized: true,
  clearExpiresAtOnLogout: true,
  clearSessionStorageKeys: ["pendingTableRedirect", "authFromPaymentFlow", "authFromMenu", "pendingRestaurantId"],
  clearLocalStorageKeys: ["even-guest-id", "even-table-number", "even-restaurant-id"],
});

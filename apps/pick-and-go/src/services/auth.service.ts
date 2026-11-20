import { createAuthService } from "@even/auth";
export type { AuthResponse, ProfileData, TermsStatus } from "@even/auth";

export const authService = createAuthService({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  termsSource: "pick-and-go",
  refreshSingleFlight: "refresh-token",
  retryProfileUpdateOnUnauthorized: true,
  clearExpiresAtOnLogout: true,
  refreshTimeoutMs: 10000,
  clearSessionStorageKeys: ["pendingPickAndGoRedirect", "even-post-auth-redirect", "authFromMenu", "authFromPaymentFlow", "pendingRestaurantId", "pendingBranchNumber"],
  clearLocalStorageKeys: ["even-guest-id", "even-restaurant-id", "even-branch-number"],
});

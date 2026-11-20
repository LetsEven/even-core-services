import { createAuthService } from "@even/auth";
export type { AuthResponse, ProfileData, TermsStatus } from "@even/auth";

export const authService = createAuthService({
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api",
  termsSource: "flex-bill",
  refreshSingleFlight: "refresh-token",
  retryProfileUpdateOnUnauthorized: true,
  clearExpiresAtOnLogout: true,
  clearAuthTokenSessionKeys: ["was_authenticated"],
  clearSessionStorageKeys: [],
  clearLocalStorageKeys: ["even-guest-id", "even-table-number", "even-restaurant-id", "even-guest-name"],
});

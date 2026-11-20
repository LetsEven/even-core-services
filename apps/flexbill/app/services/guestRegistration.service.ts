import { createGuestRegistration } from "@even/auth";

export const { registerGuestWithTerms } = createGuestRegistration({
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api",
  termsSource: "flex-bill",
});

import { createGuestRegistration } from "@even/auth";

export const { registerGuestWithTerms } = createGuestRegistration({
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  termsSource: "room-service",
});

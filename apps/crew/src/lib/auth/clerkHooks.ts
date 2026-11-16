import { useSignIn } from "@clerk/clerk-react";

/** Formulario de login de Clerk (solo lo usa la pantalla de login de Clerk). */
export function useClerkSignInForm() {
  return useSignIn();
}

import { AUTH_FLOW_STEPS } from "@even/ui/diner";

/**
 * Pasos que se animan entre sí (segmentos de ruta): la cuenta de la mesa, el flujo de pago y el inicio de sesión
 * (`auth-selection` desde la cuenta, `auth` desde el menú o tras pagar).
 */
export const FLOW_STEPS = [
  "order",
  "cart",
  "payment-options",
  "tip-selection",
  "card-selection",
  "user",
  "add-card",
  ...AUTH_FLOW_STEPS,
] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

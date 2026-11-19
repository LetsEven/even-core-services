import { AUTH_FLOW_STEPS } from "@even/ui/diner";

/** Pasos de la cuenta, el flujo de pago y el inicio de sesión que se animan entre sí (segmentos de ruta). */
export const FLOW_STEPS = [
  "order",
  "payment-options",
  "tip-selection",
  "card-selection",
  "user",
  "add-card",
  ...AUTH_FLOW_STEPS,
] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

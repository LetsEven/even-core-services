import { AUTH_FLOW_STEPS } from "@even/ui/diner";

/** Pasos del flujo de compra y del inicio de sesión que se animan entre sí (segmentos de ruta). */
export const FLOW_STEPS = ["cart", "order-confirm", "card-selection", "add-card", ...AUTH_FLOW_STEPS] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

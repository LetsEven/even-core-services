/** Pasos del flujo de pago que se animan entre sí (segmentos de ruta). */
export const FLOW_STEPS = ["payment-options", "tip-selection", "card-selection"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

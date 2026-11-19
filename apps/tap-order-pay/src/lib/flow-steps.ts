/** Pasos del flujo de compra que se animan entre sí (segmentos de ruta). */
export const FLOW_STEPS = ["cart", "order-confirm", "card-selection"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

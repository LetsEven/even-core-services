import type { OrderType } from "../../types";

// Ajustes operativos por sucursal. Todo comportamiento que antes estaba fijo
// en código (qué servicio usa una mesa libre, qué ve cada rol...) se consulta
// aquí. Los defaults viven en código; `branches.crew_config` (jsonb, cuando el
// backend lo exponga) los sobrescribe campo por campo sin redeploy.

export type FreeTableService = "ask" | "tap_pay" | "flex_bill" | "pos_even";
export type ServiceIndicator = "dot_initial" | "dot" | "initial" | "hidden";

export interface CrewConfig {
  freeTableService: FreeTableService;
  waiterSees: "all" | "mine";
  serviceChangeOnOpenAccount: "off" | "super" | "super_cajero";
  kitchenWithoutOperate: "read" | "operate";
  cashierChargesAny: boolean;
  serviceIndicator: ServiceIndicator;
}

export const DEFAULT_CREW_CONFIG: CrewConfig = {
  freeTableService: "ask",
  waiterSees: "all",
  serviceChangeOnOpenAccount: "super",
  kitchenWithoutOperate: "read",
  cashierChargesAny: true,
  serviceIndicator: "dot_initial",
};

const ALLOWED: { [K in keyof CrewConfig]: readonly CrewConfig[K][] } = {
  freeTableService: ["ask", "tap_pay", "flex_bill", "pos_even"],
  waiterSees: ["all", "mine"],
  serviceChangeOnOpenAccount: ["off", "super", "super_cajero"],
  kitchenWithoutOperate: ["read", "operate"],
  cashierChargesAny: [true, false],
  serviceIndicator: ["dot_initial", "dot", "initial", "hidden"],
};

// Acepta lo que venga del backend; cada campo inválido o ausente cae a su
// default, así un valor corrupto nunca rompe la app.
export function resolveCrewConfig(raw: unknown): CrewConfig {
  const src =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...DEFAULT_CREW_CONFIG };
  for (const key of Object.keys(ALLOWED) as (keyof CrewConfig)[]) {
    const allowed = ALLOWED[key] as readonly unknown[];
    if (allowed.includes(src[key])) out[key] = src[key];
  }
  return out as unknown as CrewConfig;
}

export type OpenService = "tap_pay" | "flex_bill" | "pos_even" | "ask";

// Qué servicio usar al abrir una mesa libre. Un servicio fijo solo vale si la
// sucursal lo tiene contratado; con un solo servicio de mesa se usa ese; sin
// ninguno, POS Even; con varios y sin preferencia, se pregunta.
export function resolveOpenService(
  config: Pick<CrewConfig, "freeTableService">,
  activeOrderTypes: OrderType[],
): OpenService {
  const tableServices = (["tap_pay", "flex_bill"] as const).filter((s) =>
    activeOrderTypes.includes(s),
  );
  const pref = config.freeTableService;
  if (pref === "pos_even") return "pos_even";
  if (pref === "tap_pay" || pref === "flex_bill") {
    if (tableServices.includes(pref)) return pref;
  }
  if (tableServices.length === 0) return "pos_even";
  if (tableServices.length === 1) return tableServices[0];
  return "ask";
}

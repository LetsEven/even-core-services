import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREW_CONFIG,
  resolveCrewConfig,
  resolveOpenService,
} from "./crewConfig";

describe("resolveCrewConfig", () => {
  it("sin dato devuelve los defaults", () => {
    expect(resolveCrewConfig(undefined)).toEqual(DEFAULT_CREW_CONFIG);
    expect(resolveCrewConfig("x")).toEqual(DEFAULT_CREW_CONFIG);
  });
  it("sobrescribe campo por campo e ignora valores inválidos", () => {
    const c = resolveCrewConfig({
      waiterSees: "mine",
      kitchenWithoutOperate: "boom",
      cashierChargesAny: false,
    });
    expect(c.waiterSees).toBe("mine");
    expect(c.kitchenWithoutOperate).toBe("read");
    expect(c.cashierChargesAny).toBe(false);
  });
});

describe("resolveOpenService", () => {
  const ask = { freeTableService: "ask" } as const;
  it("sin servicios de mesa usa POS Even", () => {
    expect(resolveOpenService(ask, ["pick_and_go"])).toBe("pos_even");
  });
  it("con uno solo usa ese", () => {
    expect(resolveOpenService(ask, ["flex_bill"])).toBe("flex_bill");
  });
  it("con dos y sin preferencia pregunta", () => {
    expect(resolveOpenService(ask, ["flex_bill", "tap_pay"])).toBe("ask");
  });
  it("respeta un servicio fijo contratado y descarta uno no contratado", () => {
    expect(
      resolveOpenService({ freeTableService: "tap_pay" }, ["flex_bill", "tap_pay"]),
    ).toBe("tap_pay");
    expect(
      resolveOpenService({ freeTableService: "tap_pay" }, ["flex_bill"]),
    ).toBe("flex_bill");
  });
  it("pos_even siempre gana", () => {
    expect(
      resolveOpenService({ freeTableService: "pos_even" }, ["flex_bill", "tap_pay"]),
    ).toBe("pos_even");
  });
});

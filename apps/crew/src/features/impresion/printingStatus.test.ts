import { describe, expect, it } from "vitest";
import { BRIDGE_STATUS_UNKNOWN } from "./bridgeStatus";
import { getPrintingStatus } from "./printingStatus";
import { groupByStation } from "./stations";
import type { PrinterRecord } from "../../services/api";

const base = {
  deviceId: "me",
  masterDeviceId: null as string | null,
  connectedDevices: [] as { deviceId: string; socketId: null; connectedAt: null; online: boolean; platform?: "web" | "native" }[],
  canPrint: true,
  bridge: BRIDGE_STATUS_UNKNOWN,
};

describe("getPrintingStatus", () => {
  it("nadie imprime sin dispositivo ni bridge, y se puede activar aquí si es nativo", () => {
    expect(getPrintingStatus(base)).toEqual({
      kind: "nadie",
      reason: "sin-dispositivo",
      canActivateHere: true,
    });
  });
  it("en web no se puede activar", () => {
    expect(getPrintingStatus({ ...base, canPrint: false })).toMatchObject({
      kind: "nadie",
      canActivateHere: false,
    });
  });
  it("este dispositivo nativo imprime", () => {
    expect(getPrintingStatus({ ...base, masterDeviceId: "me" })).toEqual({ kind: "este-equipo" });
  });
  it("este dispositivo web como principal no imprime", () => {
    expect(getPrintingStatus({ ...base, masterDeviceId: "me", canPrint: false })).toMatchObject({
      kind: "nadie",
      reason: "dispositivo-web",
    });
  });
  it("otro equipo conectado imprime; offline no", () => {
    const dev = { deviceId: "x", socketId: null, connectedAt: null, online: true };
    expect(getPrintingStatus({ ...base, masterDeviceId: "x", connectedDevices: [dev] })).toEqual({
      kind: "otro-equipo",
    });
    expect(
      getPrintingStatus({ ...base, masterDeviceId: "x", connectedDevices: [{ ...dev, online: false }] }),
    ).toMatchObject({ kind: "nadie", reason: "dispositivo-offline" });
  });
  it("bridge conectado cuenta como impresión", () => {
    expect(
      getPrintingStatus({ ...base, bridge: { state: "conectado", lastSeenAt: null } }),
    ).toEqual({ kind: "bridge" });
  });
});

describe("groupByStation", () => {
  const mk = (id: string, role: PrinterRecord["role"], active = true) =>
    ({ id, role, is_active: active, connection_type: "wifi" }) as PrinterRecord;
  it("agrupa por rol y omite inactivas y vacías", () => {
    const s = groupByStation([mk("1", "kitchen"), mk("2", "kitchen"), mk("3", "bar", false), mk("4", null)]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ role: "kitchen", label: "Cocina" });
    expect(s[0].printers).toHaveLength(2);
  });
});

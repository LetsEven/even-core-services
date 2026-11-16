import type { PrinterRecord } from "../../services/api";

export const ROLES = [
  { value: "bar", label: "Bar", badge: "bg-sky-500/15 text-sky-700 ring-sky-500/30" },
  { value: "kitchen", label: "Cocina", badge: "bg-orange-500/15 text-orange-700 ring-orange-500/30" },
  { value: "other", label: "Otro", badge: "bg-purple-500/15 text-purple-700 ring-purple-500/30" },
  { value: "all", label: "Todos", badge: "bg-even-grass/25 text-even-evergreen ring-even-grass/40" },
  { value: "payment", label: "Pagos", badge: "bg-amber-500/15 text-amber-700 ring-amber-500/30" },
] as const;

export type PrinterRole = (typeof ROLES)[number]["value"];

export function roleLabel(role: string | null | undefined): string | null {
  return ROLES.find((r) => r.value === role)?.label ?? null;
}

export interface Station {
  role: PrinterRole;
  label: string;
  printers: PrinterRecord[];
}

/** Agrupa impresoras activas por estación (rol). Solo estaciones con impresoras. */
export function groupByStation(printers: PrinterRecord[]): Station[] {
  return ROLES.map((r) => ({
    role: r.value,
    label: r.label,
    printers: printers.filter((p) => p.role === r.value && p.is_active !== false),
  })).filter((s) => s.printers.length > 0);
}

export function printerAddress(p: PrinterRecord): string {
  return p.connection_type === "usb"
    ? (p.usb_device_name ?? "USB")
    : `${p.ip ?? "?"}:${p.port ?? "?"}`;
}

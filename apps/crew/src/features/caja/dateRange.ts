export type CajaFilter = "today" | "last7" | "last30" | string;

export const FIXED_FILTERS: { id: CajaFilter; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "last7", label: "7 días" },
  { id: "last30", label: "30 días" },
];

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
  "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function monthLabel(ym: string) {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES_ES[parseInt(month) - 1]} ${year}`;
}

export function getDateRange(filter: CajaFilter): { since: string; until: string } {
  const now = new Date();
  if (filter === "today") {
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    const until = new Date(now);
    until.setHours(23, 59, 59, 999);
    return { since: since.toISOString(), until: until.toISOString() };
  }
  if (filter === "last7" || filter === "last30") {
    const since = new Date(now);
    since.setDate(since.getDate() - (filter === "last7" ? 7 : 30));
    since.setHours(0, 0, 0, 0);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  const [year, month] = filter.split("-").map(Number);
  const since = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const until = new Date(year, month, 0, 23, 59, 59, 999);
  return { since: since.toISOString(), until: until.toISOString() };
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

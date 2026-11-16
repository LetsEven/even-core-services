// El backend arma `identifier` como texto ya formateado, ej. "Mesa 5",
// "Habitación A509-B", "Habitación 101 - Juan Perez", "Pick & Go", "Tap & Pay".
// Estos helpers lo interpretan sin asumir que el código sea numérico (ya
// puede ser alfanumérico libre).

export type LocationKind = "table" | "room" | "pick" | "other";

export function getLocationKind(identifier: string): LocationKind {
  if (/habitaci[oó]n|cuarto/i.test(identifier)) return "room";
  if (/^mesa\b/i.test(identifier)) return "table";
  if (/pick/i.test(identifier)) return "pick";
  return "other";
}

// Extrae el código de mesa/habitación de un identifier ya formateado,
// quitando el prefijo ("Mesa "/"Habitación "/"Cuarto ") y cualquier sufijo
// " - NombreCliente" que el backend le haya agregado. Devuelve null si el
// identifier no trae un prefijo de mesa/habitación reconocido (Pick & Go,
// Tap & Pay, FlexBill, etc).
export function parseLocationCode(identifier: string): string | null {
  const match = identifier.match(/^(mesa|habitaci[oó]n|cuarto)\s+(.+)$/i);
  if (!match) return null;
  return match[2].split(" - ")[0].trim() || null;
}

// Para mostrar: códigos puramente numéricos mantienen el padding legado
// ("5" -> "05"); los alfanuméricos se muestran tal cual.
export function padLocationCode(code: string): string {
  return /^\d+$/.test(code) ? code.padStart(2, "0") : code;
}

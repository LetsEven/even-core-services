import { CrewAuthError } from "../../lib/auth/localClient";

export const PIN_MIN = 4;
export const PIN_MAX = 8;
/** Mismo umbral y espera que el servicio (5 fallos, 15 min). */
export const MAX_FAILURES = 5;
export const DEFAULT_LOCKOUT_S = 15 * 60;

export function appendDigit(pin: string, digit: string): string {
  return /^\d$/.test(digit) && pin.length < PIN_MAX ? pin + digit : pin;
}

export function isValidPin(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length >= PIN_MIN && pin.length <= PIN_MAX;
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Segundos de espera si el error es un lockout / rate limit, si no null. */
export function lockoutSeconds(e: unknown): number | null {
  if (e instanceof CrewAuthError && e.isLocked) {
    return e.retryAfter ?? DEFAULT_LOCKOUT_S;
  }
  return null;
}

// Mensajes genericos: nunca dicen si el usuario existe, esta inactivo o cual
// dato fallo.
export function loginErrorMessage(e: unknown): string {
  if (e instanceof CrewAuthError && e.isNetwork) {
    return "Sin conexión con el servidor. Revisa la red e intenta de nuevo.";
  }
  return "Usuario o PIN incorrecto.";
}

export function pairingErrorMessage(e: unknown): string {
  if (e instanceof CrewAuthError && e.isNetwork) {
    return "Sin conexión con el servidor. Revisa la red e intenta de nuevo.";
  }
  if (e instanceof CrewAuthError && e.isLocked) {
    return "Demasiados intentos. Espera unos minutos.";
  }
  return "Código inválido o vencido. Pide uno nuevo al gerente.";
}

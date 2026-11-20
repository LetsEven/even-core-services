/**
 * Utilidades puras del inicio de sesión por teléfono (SMS) que comparten las apps de comensal:
 * países, formato del número, edad ⇄ fecha de nacimiento y perfil completo.
 */

export type Country = { code: string; flag: string; name: string };

export const COUNTRIES: readonly Country[] = [
  { code: "+52", flag: "MX", name: "México" },
  { code: "+1", flag: "US", name: "Estados Unidos" },
  { code: "+34", flag: "ES", name: "España" },
  { code: "+54", flag: "AR", name: "Argentina" },
  { code: "+57", flag: "CO", name: "Colombia" },
  { code: "+58", flag: "VE", name: "Venezuela" },
];

export const DEFAULT_COUNTRY_CODE = "+52";
export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;
export const MIN_PHONE_DIGITS = 8;
export const MIN_AGE = 12;
export const MAX_AGE = 70;

/** Número ya completo (con lada) para mostrar: "55 1234 5678" → "551 234 5678", "+5255…" → "+52 (551) 234-5678". */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  if (cleaned.length > 10) {
    const country = cleaned.slice(0, cleaned.length - 10);
    return `+${country} (${cleaned.slice(-10, -7)}) ${cleaned.slice(-7, -4)}-${cleaned.slice(-4)}`;
  }
  return phone;
}

/** Formato del campo mientras se escribe: grupos de 3-3-4 dígitos, máximo 10. */
export function formatPhoneInput(value: string): string {
  const cleaned = value.replace(/\D/g, "");
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 10)}`;
}

/** El backend guarda fecha de nacimiento; el formulario pide solo la edad: se usa el 1 de enero del año resultante. */
export function birthDateFromAge(age: number, now: Date = new Date()): string {
  return `${now.getUTCFullYear() - age}-01-01`;
}

export function ageFromBirthDate(birthDate?: string | null, now: Date = new Date()): number | "" {
  if (!birthDate) return "";
  const year = new Date(birthDate).getUTCFullYear();
  return Number.isNaN(year) ? "" : now.getUTCFullYear() - year;
}

type ProfileLike = { firstName?: string | null; birthDate?: string | null } | null | undefined;

/** Perfil completo = nombre y fecha de nacimiento (el apellido es opcional). */
export function isProfileComplete(profile: ProfileLike): boolean {
  return !!profile?.firstName && !!profile?.birthDate;
}

/** El backend a veces envuelve el perfil (`data.data.profile`, `data.profile`, `data`): devuelve el perfil plano. */
export function unwrapProfile(payload: unknown): { firstName?: string; lastName?: string; birthDate?: string } | null {
  const body = payload as Record<string, any> | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!body || typeof body !== "object") return null;
  return body.data?.profile || body.profile || body.data || body;
}

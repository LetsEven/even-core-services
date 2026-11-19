import en from "./messages/en.json";
import es from "./messages/es.json";

export type Messages = { [key: string]: string | Messages };

function isMessages(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Combina los textos compartidos con los de la app: la app gana en cada clave, así puede sobrescribir
 * un texto o agregar namespaces propios. Devuelve un objeto nuevo y no modifica los de entrada.
 */
export function mergeMessages(shared: Messages, own: Messages): Messages {
  const result: Messages = { ...shared };
  for (const [key, value] of Object.entries(own)) {
    const base = result[key];
    result[key] = isMessages(base) && isMessages(value) ? mergeMessages(base, value) : value;
  }
  return result;
}

/**
 * Textos compartidos por idioma. Se importan de forma estática (no con import dinámico por locale):
 * Turbopack resuelve `@even/i18n/messages/${locale}.json` contra el mapa `exports` y solo incluía es.json,
 * lo que rompía el idioma inglés en producción.
 */
export const sharedMessages: Record<"es" | "en", Messages> = { es, en };

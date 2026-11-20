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
 * Textos compartidos de un idioma. Imports estáticos a propósito: un `import()` con plantilla sobre el
 * subpath del paquete (`@even/i18n/messages/${locale}.json`) no queda en el bundle de Turbopack y en
 * producción truena con MODULE_NOT_FOUND para el idioma que no se resolvió al compilar.
 */
export async function loadSharedMessages(locale: string): Promise<Messages> {
  switch (locale) {
    case "en":
      return (await import("./messages/en.json")).default as Messages;
    default:
      return (await import("./messages/es.json")).default as Messages;
  }
}

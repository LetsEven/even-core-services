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

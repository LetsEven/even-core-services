/**
 * Respuestas recientes de refresh, solo en memoria y por pocos segundos: si el refresh recien rotado
 * se vuelve a presentar dentro de la ventana de gracia (respuesta perdida, dos pestanas), se devuelve
 * la MISMA respuesta. No se guardan tokens en claro en la base: tras un reinicio del proceso no hay
 * cache y el reuso se trata como robo (falla del lado seguro).
 */
export class GraceCache<T> {
  private readonly entries = new Map<string, { value: Promise<T>; until: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number,
    private readonly max = 1000,
  ) {}

  /** Se guarda la promesa para que una peticion concurrente espere la misma respuesta. */
  set(key: string, value: Promise<T>): void {
    const t = this.now()
    for (const [k, e] of this.entries) {
      if (e.until >= t) break // por orden de insercion, el resto es mas reciente
      this.entries.delete(k)
    }
    this.entries.set(key, { value, until: t + this.ttlMs })
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
    value.catch(() => this.entries.delete(key))
  }

  get(key: string): Promise<T> | undefined {
    const e = this.entries.get(key)
    if (!e) return undefined
    if (e.until < this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return e.value
  }

  delete(key: string): void {
    this.entries.delete(key)
  }
}

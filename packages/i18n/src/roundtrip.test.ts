import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSharedMessages, mergeMessages, type Messages } from "./index";

/**
 * Guarda de la migración a @even/i18n: `shared + own` debe dar los mismos textos que cada app tenía
 * en main antes de mover los namespaces idénticos al paquete (es y en).
 *
 * La base es el commit fijo `8f2a7df` (origin/main antes de la unificación). Si el objeto no está en el
 * clon (por ejemplo, un checkout superficial) las comparaciones con la base se omiten; el resto
 * (invariantes de forma) corre siempre. Al cambiar textos a propósito, actualiza o elimina la guarda.
 */
const BASE_COMMIT = "8f2a7df";
const REPO_ROOT = resolve(__dirname, "../../..");

const APPS: Record<string, string> = {
  "pick-and-go": "apps/pick-and-go",
  "room-service": "apps/room-service",
  "tap-order-pay": "apps/tap-order-pay",
  flexbill: "apps/flexbill",
  "tap-and-pay": "apps/tap-and-pay",
};
const LOCALES = ["es", "en"] as const;

const readOwn = (app: string, locale: string): Messages =>
  JSON.parse(readFileSync(resolve(REPO_ROOT, APPS[app], "messages", `${locale}.json`), "utf8"));

function readBase(app: string, locale: string): Messages {
  const out = execFileSync("git", ["show", `${BASE_COMMIT}:${APPS[app]}/messages/${locale}.json`], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function baseAvailable(): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${BASE_COMMIT}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hasBase = baseAvailable();

/** `value` recortado a las claves de `shape` (recursivo), para comparar sin las claves nuevas. */
function pick(value: unknown, shape: unknown): unknown {
  if (typeof shape !== "object" || shape === null || typeof value !== "object" || value === null) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    if (key in value) {
      out[key] = pick((value as Record<string, unknown>)[key], (shape as Record<string, unknown>)[key]);
    }
  }
  return out;
}

describe.each(LOCALES)("mensajes compartidos (%s)", (locale) => {
  describe.each(Object.keys(APPS))("%s", (app) => {
    it("los namespaces propios no repiten los compartidos", async () => {
      const shared = await loadSharedMessages(locale);
      const repeated = Object.keys(readOwn(app, locale)).filter((ns) => ns in shared);
      expect(repeated).toEqual([]);
    });

    it.runIf(hasBase)("shared + own == mensajes de main", async () => {
      const shared = await loadSharedMessages(locale);
      const base = readBase(app, locale);
      const merged = mergeMessages(shared, readOwn(app, locale));

      // Cada texto que la app tenía llega idéntico. Se permiten claves nuevas (funciones que llegaron
      // después de la migración), pero no perder ni cambiar las que ya existían.
      for (const [ns, value] of Object.entries(base)) {
        expect(pick(merged[ns], value), `${app}/${locale}: ${ns}`).toEqual(value);
      }
      // Lo único extra son namespaces compartidos que esa app no tenía (nadie los lee ahí).
      const extras = Object.keys(merged).filter((ns) => !(ns in base));
      expect(extras.every((ns) => ns in shared)).toBe(true);
      expect(Object.keys(merged).sort()).toEqual([...Object.keys(base), ...extras].sort());
    });
  });

  it("es y en comparten los mismos namespaces", async () => {
    const [es, en] = await Promise.all([loadSharedMessages("es"), loadSharedMessages("en")]);
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
});

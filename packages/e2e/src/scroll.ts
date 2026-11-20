import { expect, type Page } from "@playwright/test";

/** Holgura (px) para el redondeo de subpíxeles al comparar scrollHeight/clientHeight. */
export const SCROLL_TOLERANCE = 1;

export interface ScrollIssue {
  kind: "document-y" | "document-x" | "element-y" | "element-x";
  /** Descripción corta del elemento (`tag#id.clase`), con su ruta de ancestros cercanos. */
  target: string;
  scroll: number;
  client: number;
}

export interface ScrollOptions {
  /** Selectores CSS cuyo scroll interno es legítimo (p. ej. la lista larga de platillos). */
  allow?: readonly string[];
  /** Permite que la página entera se desplace en vertical (vistas con contenido realmente más alto que la pantalla). */
  allowDocumentY?: boolean;
}

/**
 * Mide los scrolls que hay en la página ahora mismo: el del documento (vertical y horizontal) y el de cualquier
 * elemento con `overflow: auto | scroll` cuyo contenido no cabe. Un `overflow: hidden` no cuenta: no hay barra.
 */
export async function measureScroll(page: Page, { allow = [], allowDocumentY = false }: ScrollOptions = {}) {
  return page.evaluate(
    ({ allow, allowDocumentY, tolerance }) => {
      const issues: ScrollIssue[] = [];
      const describe = (el: Element) => {
        const parts: string[] = [];
        let node: Element | null = el;
        for (let i = 0; node && i < 3 && node !== document.documentElement; i += 1, node = node.parentElement) {
          const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
          parts.unshift(`${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${cls ? `.${cls}` : ""}`);
        }
        return parts.join(" > ");
      };
      const root = document.scrollingElement ?? document.documentElement;
      if (!allowDocumentY && root.scrollHeight - root.clientHeight > tolerance) {
        issues.push({ kind: "document-y", target: "document", scroll: root.scrollHeight, client: root.clientHeight });
      }
      if (root.scrollWidth - root.clientWidth > tolerance) {
        issues.push({ kind: "document-x", target: "document", scroll: root.scrollWidth, client: root.clientWidth });
      }
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (allow.some((selector) => el.closest(selector))) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const scrollsY = style.overflowY === "auto" || style.overflowY === "scroll";
        const scrollsX = style.overflowX === "auto" || style.overflowX === "scroll";
        if (scrollsY && el.scrollHeight - el.clientHeight > tolerance) {
          issues.push({ kind: "element-y", target: describe(el), scroll: el.scrollHeight, client: el.clientHeight });
        }
        if (scrollsX && el.scrollWidth - el.clientWidth > tolerance) {
          issues.push({ kind: "element-x", target: describe(el), scroll: el.scrollWidth, client: el.clientWidth });
        }
      }
      return issues;
    },
    { allow: [...allow], allowDocumentY, tolerance: SCROLL_TOLERANCE },
  );
}

/**
 * Comprueba que la vista actual no tiene scrolls inesperados: ni la página entera se desplaza, ni hay
 * desbordes horizontales, ni elementos con barra de scroll propia. Para vistas con contenido largo, declara
 * `allow` (scroll interno legítimo) o `allowDocumentY`.
 * Espera a que la animación de la tarjeta termine (sin overlay) antes de medir, y reintenta un instante
 * por si el contenido aún se está acomodando.
 */
export async function expectNoUnexpectedScroll(page: Page, options: ScrollOptions = {}, label = "la vista") {
  await expect(page.locator("[data-flow-overlay]")).toHaveCount(0);
  await expect
    .poll(async () => (await measureScroll(page, options)).map((i) => `${i.kind} ${i.target} ${i.scroll}>${i.client}`), {
      message: `Scrolls inesperados en ${label} (${page.viewportSize()?.width}x${page.viewportSize()?.height})`,
      timeout: 3_000,
    })
    .toEqual([]);
}

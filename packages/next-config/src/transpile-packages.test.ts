import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Check de CI (plan C16): todo `@even/*` en las `dependencies` de una app debe
// estar en el `transpilePackages` de su next.config, y viceversa. Los paquetes
// exportan TypeScript fuente: si falta uno, el build o el runtime fallan solo
// en esa app. Los `devDependencies` (@even/e2e, @even/tsconfig...) no cuentan:
// no entran al bundle.

const appsDir = fileURLToPath(new URL("../../../apps", import.meta.url));
const apps = readdirSync(appsDir, { withFileTypes: true })
  // Solo las apps de Next: crew (Vite) y crew-auth (Node) no tienen next.config.
  .filter((entry) => entry.isDirectory() && existsSync(join(appsDir, entry.name, "next.config.ts")))
  .map((entry) => entry.name)
  .sort();

describe("transpilePackages de cada app", () => {
  it("encuentra las apps del monorepo", () => {
    expect(apps.length).toBeGreaterThan(0);
  });

  it.each(apps)("%s lista exactamente sus dependencias @even/*", async (app) => {
    const pkg = JSON.parse(readFileSync(join(appsDir, app, "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
    };
    const expected = Object.keys(pkg.dependencies ?? {})
      .filter((name) => name.startsWith("@even/"))
      .sort();

    const mod = (await import(join(appsDir, app, "next.config.ts"))) as {
      default: { transpilePackages?: string[] };
    };
    const actual = [...(mod.default.transpilePackages ?? [])].sort();

    expect(actual).toEqual(expected);
  });
});

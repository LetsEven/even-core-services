import type { NextConfig } from "next";

/**
 * Los paquetes `@even/*` exportan TypeScript fuente (`exports: ./src/index.ts`),
 * así que Next debe compilarlos: toda app que use uno tiene que listarlo en
 * `transpilePackages`. Esta función es el único lugar donde se declara; el test
 * `transpile-packages.test.ts` comprueba que la lista de cada app coincide con
 * sus `dependencies` `@even/*`.
 */
export function withEvenTranspile(
  config: NextConfig,
  packages: readonly string[],
): NextConfig {
  for (const name of packages) {
    if (!name.startsWith("@even/")) {
      throw new Error(`withEvenTranspile solo acepta paquetes @even/*: "${name}"`);
    }
  }
  return {
    ...config,
    transpilePackages: [...(config.transpilePackages ?? []), ...packages],
  };
}

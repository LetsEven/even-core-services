import { describe, expect, it } from "vitest";
import { withEvenTranspile } from "./index";

describe("withEvenTranspile", () => {
  it("agrega transpilePackages conservando el resto de la config y el orden", () => {
    const config = withEvenTranspile({ distDir: ".x" }, ["@even/b", "@even/a"]);
    expect(config).toEqual({ distDir: ".x", transpilePackages: ["@even/b", "@even/a"] });
  });

  it("conserva los transpilePackages que ya tenía la config", () => {
    const config = withEvenTranspile({ transpilePackages: ["otro"] }, ["@even/ui"]);
    expect(config.transpilePackages).toEqual(["otro", "@even/ui"]);
  });

  it("rechaza paquetes fuera del scope @even", () => {
    expect(() => withEvenTranspile({}, ["react"])).toThrow(/@even/);
  });
});

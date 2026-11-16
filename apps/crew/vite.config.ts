import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { buildCsp, type CspEnv } from "./src/lib/csp.ts";

// Sustituye %CREW_CSP% (meta CSP de index.html) por la politica de este build,
// calculada con las VITE_* (ver src/lib/csp.ts). En dev lleva ademas lo que el
// servidor de desarrollo necesita, para que las violaciones salgan tambien ahi.
function cspPlugin(): Plugin {
  let env: CspEnv = {};
  let dev = false;
  return {
    name: "crew-csp",
    configResolved(config) {
      env = config.env as unknown as CspEnv;
      dev = config.command === "serve";
    },
    transformIndexHtml(html) {
      return html.replace("%CREW_CSP%", () => buildCsp(env, { dev }));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin()],
});

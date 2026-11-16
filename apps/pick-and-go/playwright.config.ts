import { createPlaywrightConfig } from "@even/e2e";
import { API_URL } from "./e2e/mocks";

const PORT = 3105;
const INNER_PORT = 3205;
const baseURL = `https://localhost:${PORT}`;

// Apple Pay solo se pinta sobre HTTPS, así que los e2e de Pick & Go corren detrás de un proxy TLS local
// (e2e/https-server.mjs) con un certificado autofirmado.
export default createPlaywrightConfig({
  port: PORT,
  env: { NEXT_PUBLIC_API_URL: API_URL },
  overrides: {
    use: {
      baseURL,
      ignoreHTTPSErrors: true,
      locale: "es-MX",
      timezoneId: "America/Mexico_City",
      trace: "on-first-retry",
      screenshot: "only-on-failure",
    },
    webServer: {
      command: "next build && node e2e/https-server.mjs",
      url: baseURL,
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_TELEMETRY_DISABLED: "1",
        E2E_HTTPS_PORT: String(PORT),
        E2E_INNER_PORT: String(INNER_PORT),
      },
    },
  },
});

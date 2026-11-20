import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withEvenTranspile } from "@even/next-config";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // Los tests E2E construyen en su propio directorio para no pisar el build normal.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/app.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

// Los paquetes @even/* se publican como TypeScript fuente; Next los compila.
export default withNextIntl(
  withEvenTranspile(nextConfig, [
    "@even/realtime",
    "@even/auth",
    "@even/api-client",
    "@even/cart",
    "@even/i18n",
    "@even/next-config",
    "@even/payments",
    "@even/security",
    "@even/ui",
  ]),
);

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withEvenTranspile } from "@even/next-config";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Apple Pay valida el dominio pidiendo este archivo sin extensión; en public/
  // vive con .txt, así que se reescribe al estático (sin código en runtime).
  async rewrites() {
    return [
      {
        source: "/.well-known/apple-developer-merchantid-domain-association",
        destination: "/.well-known/apple-developer-merchantid-domain-association.txt",
      },
    ];
  },
  devIndicators: false,
  // Los tests E2E construyen en su propio directorio para no pisar el build normal.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Security headers are now handled by middleware.ts with dynamic nonces
  // for PCI DSS compliance (no unsafe-inline in CSP)
};

// Los paquetes @even/* se publican como TypeScript fuente; Next los compila.
export default withNextIntl(
  withEvenTranspile(nextConfig, [
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

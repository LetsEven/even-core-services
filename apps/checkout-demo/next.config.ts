import type { NextConfig } from "next";
import { withEvenTranspile } from "@even/next-config";

const nextConfig: NextConfig = {
  // Los tests E2E construyen en su propio directorio para no pisar el build normal.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

// Los paquetes @even/* se publican como TypeScript fuente; Next los compila.
export default withEvenTranspile(nextConfig, ["@even/api-client", "@even/next-config", "@even/payments", "@even/ui"]);

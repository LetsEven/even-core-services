import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, negotiateLocale } from "@even/i18n/locale";
import { getBackendOrigin } from "@even/api-client";
import { applySecurityHeaders, buildCsp } from "@even/security";

export function middleware(request: NextRequest) {
  // Generate a random nonce for each request
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Backend URL from environment variable (removes /api suffix if present)
  const backendUrl = getBackendOrigin(
    process.env.NEXT_PUBLIC_API_URL,
    "https://even-backend-production.up.railway.app",
  );
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = buildCsp({
    nonce,
    backendUrl,
    isDev,
    ecartSandbox: true,
  });

  // Clone the request headers
  const requestHeaders = new Headers(request.headers);
  // Set the nonce in a custom header so layout.tsx can read it
  requestHeaders.set("x-nonce", nonce);
  // Next.js lee el nonce de la CSP de la *petición* para etiquetar sus scripts
  // inline de hidratación; sin esto el navegador los bloquea.
  requestHeaders.set("Content-Security-Policy", cspHeader);

  // Create response with security headers
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Set all PCI DSS required security headers
  applySecurityHeaders(response.headers, { csp: cspHeader });

  if (!request.cookies.get(LOCALE_COOKIE)) {
    const detected = negotiateLocale(request.headers.get("accept-language"));
    response.cookies.set(LOCALE_COOKIE, detected, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return response;
}

// Matcher: apply to all routes except static files and images
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (images, fonts, etc.)
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|otf|ttf)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

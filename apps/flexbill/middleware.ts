import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, negotiateLocale } from "@even/i18n/locale";
import { getBackendOrigin } from "@even/api-client";
import { applySecurityHeaders, buildCsp } from "@even/security";

// Flex Bill usa otro orden en frame-src y agrega 3DS (cardinalcommerce).
const FRAME_SRC = [
  "https://ecartpay.com",
  "https://checkout.ecartpay.com",
  "https://pay.ecart.com",
  "https://app.ecart.com",
  "https://applepay.cdn-apple.com",
  "https://*.apple.com",
  "https://pay.google.com",
  "https://*.cardinalcommerce.com",
];

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const backendUrl = getBackendOrigin(
    process.env.NEXT_PUBLIC_API_URL,
    "https://even-backend-production.up.railway.app",
  );
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = buildCsp({
    nonce,
    backendUrl,
    isDev,
    strictDynamic: true,
    frameSrc: FRAME_SRC,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js lee el nonce de la CSP de la *petición* para etiquetar sus scripts
  // inline de hidratación; sin esto el navegador los bloquea.
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  applySecurityHeaders(response.headers, {
    csp: cspHeader,
    permissionsPolicy:
      'camera=(), microphone=(), geolocation=(), payment=(self "https://ecartpay.com" "https://checkout.ecartpay.com" "https://pay.ecart.com" "https://applepay.cdn-apple.com" "https://pay.google.com" "https://geo.cardinalcommerce.com")',
  });

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

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|app\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|otf|ttf)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

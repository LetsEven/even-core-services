export const DEFAULT_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

export interface SecurityHeadersOptions {
  /** Valor ya armado de `Content-Security-Policy` (ver `buildCsp`). */
  csp: string;
  /** Por defecto `DEFAULT_PERMISSIONS_POLICY`. */
  permissionsPolicy?: string;
}

/** Pone en `headers` los headers de seguridad PCI DSS que usan todas las apps. */
export function applySecurityHeaders(
  headers: Headers,
  { csp, permissionsPolicy = DEFAULT_PERMISSIONS_POLICY }: SecurityHeadersOptions,
): void {
  headers.set("Content-Security-Policy", csp);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", permissionsPolicy);
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
}

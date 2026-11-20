export interface CspOptions {
  /** Nonce de la petición (base64), sin el prefijo `nonce-`. */
  nonce: string;
  /** Origen del backend (`https://host[:puerto]`), ya sin `/api`. */
  backendUrl: string;
  /** `NODE_ENV === "development"`: agrega el backend local a `connect-src`. */
  isDev: boolean;
  /** Agrega `'strict-dynamic'` a `script-src` (Flex Bill). */
  strictDynamic?: boolean;
  /** Agrega `sandbox.ecartpay.com` a `script-src` y `frame-src` (Tap Order & Pay). */
  ecartSandbox?: boolean;
  /**
   * Reemplaza la lista completa de `frame-src` (Flex Bill agrega 3DS y usa otro
   * orden). Si se omite, `DEFAULT_FRAME_SRC`.
   */
  frameSrc?: readonly string[];
}

/** `frame-src` de Room Service, Tap & Pay y Tap Order & Pay (sin sandbox). */
export const DEFAULT_FRAME_SRC: readonly string[] = [
  "https://ecartpay.com",
  "https://pay.ecart.com",
  "https://app.ecart.com",
  "https://checkout.ecartpay.com",
  "https://applepay.cdn-apple.com",
  "https://*.apple.com",
  "https://pay.google.com",
];

const ECART_SANDBOX = "https://sandbox.ecartpay.com";

/**
 * Arma el valor del header `Content-Security-Policy` con nonce (sin
 * `unsafe-inline` en scripts, requisito PCI DSS). El resultado es idéntico,
 * byte a byte, al que cada middleware armaba con su template literal.
 *
 * El orden de las listas importa para que el header no cambie: no reordenar
 * sin actualizar los snapshots de cada app.
 */
export function buildCsp({
  nonce,
  backendUrl,
  isDev,
  strictDynamic = false,
  ecartSandbox = false,
  frameSrc = DEFAULT_FRAME_SRC,
}: CspOptions): string {
  const devUrls = isDev ? " http://localhost:5000 ws://localhost:5000" : "";
  const backendHost = backendUrl.replace(/https?:\/\//, "");
  const wsProtocol = isDev ? "ws" : "wss";

  // `sandbox.ecartpay.com` va justo después de `ecartpay.com` en ambas listas.
  const withSandbox = (list: readonly string[]) =>
    ecartSandbox
      ? [list[0], ECART_SANDBOX, ...list.slice(1)]
      : [...list];

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(strictDynamic ? ["'strict-dynamic'"] : []),
    ...withSandbox(["https://ecartpay.com", "https://pay.ecart.com", "https://applepay.cdn-apple.com", "https://pay.google.com"]),
  ];

  return [
    "default-src 'self';",
    `script-src ${scriptSrc.join(" ")};`,
    "style-src 'self' 'unsafe-inline';",
    `img-src 'self' data: blob: ${backendUrl} https://*.supabase.co https://www.gstatic.com https://*.givex.com https://storage.googleapis.com;`,
    "font-src 'self' https://applepay.cdn-apple.com;",
    `connect-src 'self' ${backendUrl} ${wsProtocol}://${backendHost}${devUrls} https://*.ecartpay.com https://pay.ecart.com https://app.ecart.com https://applepay.cdn-apple.com https://checkoutdev.ecartpay.com https://pay.google.com https://google.com https://www.google.com;`,
    `frame-src ${withSandbox(frameSrc).join(" ")};`,
    "object-src 'none';",
    "base-uri 'self';",
    "form-action 'self';",
    "frame-ancestors 'none';",
    "upgrade-insecure-requests;",
  ].join(" ");
}

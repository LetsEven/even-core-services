# Even Checkout Core

Monorepo de las apps de cliente de Even (Tap & Pay, Tap Order & Pay, Pick & Go, Room Service y FlexBill).
Cada app se despliega por separado, pero todas comparten el mismo núcleo de checkout y pagos.

## Estructura

```
apps/
  checkout-demo/      App de prueba que consume los paquetes compartidos
  tap-order-pay/      Tap Order & Pay (migrada desde LetsEven/even-tap-order-pay)
  room-service/       Room Service (migrada desde LetsEven/even-room-service)
  pick-and-go/        Pick & Go (migrada desde LetsEven/even-pick-and-go)
  tap-and-pay/        Tap & Pay (migrada desde LetsEven/even-tap-and-pay)
  flexbill/           FlexBill: dividir y pagar la cuenta de la mesa (migrada desde LetsEven/even-flexbill)
packages/
  payments/           @even/payments    Flujo de pago con Ecart Pay, tarjetas, Apple Pay, CardScanner
  api-client/         @even/api-client  Cliente HTTP tipado para even-backend
  ui/                 @even/ui          Primitivas de UI (Button, Input, Modal, layout...), tema de Tailwind y marca
  e2e/                @even/e2e         Config de Playwright y mocks de even-backend para tests E2E
  tsconfig/           @even/tsconfig    Configuración base de TypeScript
  eslint-config/      @even/eslint-config  Reglas de ESLint compartidas
```

Los paquetes `@even/*` exportan TypeScript fuente y cada app los compila con `transpilePackages`; no hay paso de build por paquete.

## UI compartida

Cada app importa el tema de `@even/ui` justo después de Tailwind y carga las fuentes con `next/font`
(variables `--font-dm-mono` y `--font-jakarta`, ver `apps/checkout-demo/src/app/layout.tsx`):

```css
@import "tailwindcss";
@import "@even/ui/theme.css";
```

El tema trae los colores de marca (`even-grass`, `even-evergreen`...), los semánticos (`primary`, `muted`, `danger`...),
animaciones y utilidades (`scrollbar-hide`, `even-highlight`, `min-h-screen-safe`). El catálogo vive en `/ui` de `checkout-demo`.

## Stack

- npm workspaces + Turborepo
- Next.js 16.4 y React 19.2 en todas las apps (una sola versión)
- Tailwind CSS 4, ESLint 9, Vitest, Playwright

## Comandos

Requiere Node 22 (`.nvmrc`).

```bash
npm install
npm run dev          # todas las apps en modo desarrollo
npm run build        # build de todo
npm run typecheck
npm run lint
npm run test
npm run e2e          # Playwright (la primera vez: npx playwright install chromium)
                     # con un Chromium ya instalado: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/ruta/a/chromium npm run e2e
```

Para una sola app: `npx turbo run dev --filter=checkout-demo`.

## Tests E2E

Cada app con E2E tiene `playwright.config.ts` usando `createPlaywrightConfig` de `@even/e2e` y sus specs en `e2e/`.
La app se construye con `NEXT_PUBLIC_API_URL=http://api.e2e.test` en `.next-e2e` (la app debe leer `NEXT_DIST_DIR` en `distDir`) y corre en Desktop Chrome y Pixel 7.

Los specs importan `test` y `expect` de `@even/e2e`, no de `@playwright/test`. Ese `test` cierra la red: los endpoints de pagos se mockean solos (`paymentsApi`), y cualquier otra petición fuera de la app se aborta y hace fallar el test, así nunca se llama a even-backend ni a Ecart Pay. Solo cubre peticiones del navegador, no fetch en Server Components.

```ts
test("muestra el error del backend", async ({ page, paymentsApi }) => {
  paymentsApi.override("GET /payment-methods", { status: 500, body: { success: false, error: "Caído" } });
  await page.goto("/pagos");
});
```

## Transición de tarjeta del flujo de pago

Las vistas de comensal con forma "título verde + tarjeta blanca" (carrito, confirmación, opciones de pago, propina, pago,
nombre del invitado, agregar tarjeta...) se animan entre sí hacia adelante y hacia atrás: la tarjeta actual baja y sube la
del paso destino con un esqueleto que mide lo mismo que la vista real. Todo vive en `@even/ui`; las apps solo declaran
configuración:

- `FlowTransitionProvider` (`@even/ui/diner`) va en el layout de la ruta del flujo y recibe `steps`, `screens` (título,
  esqueleto y forma de cada paso, armadas con `cartScreen`, `tipScreen`, `cardSelectionScreen`... de `@even/ui`) y el
  `header` del esqueleto. Ver `apps/*/**/FlowTransition.tsx`.
- `useFlowNavigation()` devuelve `{ push, replace, back(fallbackUrl?) }`: envuelve el router de Next con la animación.
  Los hooks de navegación de cada app arman la URL y delegan en él; todos los botones de volver usan `back()`, no
  `router.back()`.
- `FlowStepCard` pinta la hoja de la vista real con la misma pantalla que el esqueleto y, con `loading`, muestra el
  esqueleto mientras faltan datos (`useFlowStepReady` mantiene la transición hasta entonces).
- El gesto/botón atrás del navegador (`popstate`) anima solo la entrada. Sin vista anterior conocida, `back(fallbackUrl)`
  navega al respaldo.

No tienen forma de tarjeta (y no se animan): menú, detalle de platillo, dashboard, Pepper, `auth`/`auth-selection`
(formularios sobre el verde, con subpasos propios) y `payment-success`/`order` de FlexBill (ticket/recibo).

## Comisiones

El reparto de la comisión Even (4 %) depende del servicio; ver [docs/comisiones.md](docs/comisiones.md).

## Despliegue en Vercel

Cada app es un proyecto de Vercel distinto apuntando a este repo, con **Root Directory** en `apps/<app>`.
Vercel detecta Turborepo y solo reconstruye la app cuando cambia ella o un paquete que usa.
Las variables `NEXT_PUBLIC_*` (p. ej. `NEXT_PUBLIC_ENV_BADGE`) se incrustan en el build: tras cambiarlas hay que redesplegar.

## Migración

1. Esqueleto del monorepo (este estado).
2. `@even/payments` y `@even/api-client` desde Tap Order & Pay y Room Service, con tests E2E del checkout.
3. Migrar el resto de apps una por una, sin congelar el desarrollo en los repos actuales.

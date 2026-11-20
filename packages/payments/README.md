# @even/payments

Lógica de pago compartida, extraída de Tap Order & Pay y Room Service. TypeScript puro, sin React: el transporte HTTP y el storage se inyectan.

```ts
import { createApiClient } from "@even/api-client";
import { createPaymentService, chargeSavedCard, paymentIntentStore, pollConfirm } from "@even/payments";

const request = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
  refreshToken: () => authService.handleTokenRefresh(),
});
const paymentService = createPaymentService(request);

const outcome = await chargeSavedCard({
  service: paymentService,
  store: paymentIntentStore,
  fingerprintInput: { items, tipAmount, discountId, total },
  request: { paymentMethodId, amount, currency: "MXN", description, orderId, tableNumber, restaurantId },
  onVerifying: () => setVerifying(true),
});

if (outcome.status === "charged") {
  const confirmed = await pollConfirm(() => tapOrderService.confirmOrder({ ...body, ecartpay_order_id: outcome.ecartpayOrderId }));
}
// "retryable": no se cobró, se puede reintentar. "unconfirmed": NUNCA ofrecer recobrar.
```

| Módulo | Qué contiene |
| --- | --- |
| `payment-service.ts` | Endpoints de `/payment-methods` y `/payments` (tarjetas, cobro, MSI, Apple/Google Pay, estado de intent). |
| `idempotency.ts` | `intentKey` + fingerprint del carrito en sessionStorage (regla de oro: nunca recobrar el mismo carrito con otra clave). |
| `charge.ts` | `chargeSavedCard`: cobro con tarjeta guardada y clasificación de los códigos del backend. |
| `polling.ts` | `waitForChargedIntent` y `pollConfirm`. `pollConfirm` reintenta con `isConfirmRetryable` en todas las apps (`confirm_in_progress`, `confirm_conflict`, red, 429 y 5xx; el resto de 4xx es terminal); la opción `isConfirmRetryable` permite un predicado propio. |
| `saved-card-charge.ts` | `createSavedCardCharge`: `chargeSavedCard` + `pollConfirm` con la configuración de una app (`confirm`, `isConfirmRetryable`, `extractOrderId`). En React, `useSavedCardCharge` (`@even/payments/react`). Reglas de idempotencia intactas; el mapeo a mensajes queda en cada página. |
| `commissions.ts` / `service-payments.ts` | Tarifas (`SERVICE_COMMISSION_RATES`), `IVA_RATE`/`IVA_FACTOR` y `createServicePayments(service)`: comisión, precio/subtotal/propina de display y cuenta dividida ligados a un servicio (ver `docs/comisiones.md`). |
| `msi.ts` / `tip.ts` | `computeMsiTotal` (`total / (1 - tasa% * 1.16)`, sin redondeo) y propina: `computeTipAmount(base, pct)` sin redondear en todas las apps, igual que el backend (solo el total final se redondea), `TIP_PRESETS`, `MINIMUM_AMOUNT`. |
| `charge-request.ts` / `transaction-record.ts` | `buildChargeRequest` (cuerpo de `POST /payments`; `service` obligatorio, `undefined` en FB/TP a propósito) y `toTransactionRecord` (`POST /payment-transactions` de FB/TP). Solo asignan campos: base y propina reales, nunca precios inflados ni comisión en la base. |
| `wallet.ts` | `isDefinitiveWalletRejection` (oculta Apple/Google Pay solo ante rechazos 4xx definitivos), `classifyGooglePayError`, `WALLET_PAID_STATUSES` e `isWalletDocumentSecure` (guard HTTPS de Apple Pay; `NEXT_PUBLIC_WALLET_ALLOW_INSECURE=1` solo para e2e). |
| `ecartpay.ts` | Tipos del SDK de EcartPay, carga y normalización del resultado de `Pay.Checkout.create`. |

## `@even/payments/react`

Hooks y componentes de React en un subpath aparte, para que el núcleo siga sin depender de React. No usan `next-intl` ni los contextos de auth de cada app: todo se inyecta por props.

```tsx
import { PaymentProvider, usePayment, useEcartPay, CardScanner } from "@even/payments/react";

<PaymentProvider
  service={paymentService}
  userId={user?.id ?? null}
  guestId={isGuest ? guestId : null}
  onUserSession={(id) => { if (isGuest) setAsAuthenticated(id); /* limpiar llaves de mesa */ }}
>
  {children}
</PaymentProvider>

const t = useTranslations("CardScanner");
<CardScanner
  labels={{ title: t("title"), subtitle: t("subtitle"), scanningCta: t("scanningCta"),
            errorCameraAccess: t("errorCameraAccess"), errorScan: t("errorScan") }}
  onScanSuccess={fill}
  onClose={close}
/>
```

| Export | Notas |
| --- | --- |
| `useEcartPay` | Misma API que el hook original (`isLoading`, `error`, `createCheckout`, `waitForSDK`, `clearError`). |
| `PaymentProvider` / `usePayment` / `useHasPaymentMethods` | Misma API del contexto original. Migra tarjetas de invitado al iniciar sesión (espera `migrationDelayMs`, 1500 ms, para que el carrito migre primero) y borra `even-guest-id` solo si la migración tuvo éxito. Descarta respuestas de una sesión anterior. |
| `useWalletPayments` | Apple Pay y Google Pay con el SDK de EcartPay: carga del SDK, orden por adelantado con caché por fingerprint, eventos, 3DS de Google por polling y guard HTTPS. La app aporta `prepareOrder` (fingerprint + cuerpo de la orden), `canCreateOrders`/`orderKey` (su condición y dependencias de siempre) y callbacks de éxito/error; las diferencias entre apps son opciones (`apple.detection`, `apple.onUnsupported`, `apple.label`, `google.disabled`, `google.paymentId`, `google.createOrderWhenUnavailable`). No cambia cuándo se crean las órdenes (audit R7). |
| `CardScanner` | `labels` (por defecto `CARD_SCANNER_MESSAGES.es`) y `scan` inyectable; por defecto `simulateCardScan`, igual que hoy mientras no se integra Dyneti. |

Los estilos usan Tailwind con los tokens `even-grass` / `even-evergreen`; la app debe escanear el paquete: `@source "<ruta>/packages/payments/src";` en su CSS.

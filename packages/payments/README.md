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
| `polling.ts` | `waitForChargedIntent` y `pollConfirm`. Por defecto solo reintenta 409 `confirm_in_progress` (PG y RS); `isConfirmRetryable` permite un predicado propio (Tap Order & Pay: `confirm_conflict`, red, 429 y 5xx, ver `apps/tap-order-pay/src/utils/confirmRetry.ts`). |
| `saved-card-charge.ts` | `createSavedCardCharge`: `chargeSavedCard` + `pollConfirm` con la configuración de una app (`confirm`, `isConfirmRetryable`, `extractOrderId`). En React, `useSavedCardCharge` (`@even/payments/react`). Reglas de idempotencia intactas; el mapeo a mensajes queda en cada página. |
| `commissions.ts` / `service-payments.ts` | Tarifas (`SERVICE_COMMISSION_RATES`), `IVA_RATE`/`IVA_FACTOR` y `createServicePayments(service)`: comisión, precio/subtotal/propina de display y cuenta dividida ligados a un servicio (ver `docs/comisiones.md`). |
| `msi.ts` / `tip.ts` | `computeMsiTotal` (`total / (1 - tasa% * 1.16)`, sin redondeo) y propina: `computeTipAmount(base, pct, "none" \| "cents")` conserva el redondeo de cada app (PG/RS/TP sin redondear, TOP/FB a centavos), `TIP_PRESETS`, `MINIMUM_AMOUNT`. |
| `charge-request.ts` / `transaction-record.ts` | `buildChargeRequest` (cuerpo de `POST /payments`; `service` obligatorio, `undefined` en FB/TP a propósito) y `toTransactionRecord` (`POST /payment-transactions` de FB/TP). Solo asignan campos: base y propina reales, nunca precios inflados ni comisión en la base. |
| `wallet.ts` | `isDefinitiveWalletRejection` para ocultar Apple/Google Pay solo ante rechazos 4xx definitivos. |
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
| `CardScanner` | `labels` (por defecto `CARD_SCANNER_MESSAGES.es`) y `scan` inyectable; por defecto `simulateCardScan`, igual que hoy mientras no se integra Dyneti. |

Los estilos usan Tailwind con los tokens `even-grass` / `even-evergreen`; la app debe escanear el paquete: `@source "<ruta>/packages/payments/src";` en su CSS.

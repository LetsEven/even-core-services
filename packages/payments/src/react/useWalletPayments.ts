"use client";

import { useEffect, useRef, useState } from "react";
import type { FingerprintInput } from "../idempotency";
import type { PaymentService } from "../payment-service";
import type { WalletOrderRequest } from "../types";
import {
  classifyGooglePayError,
  isDefinitiveWalletRejection,
  isWalletDocumentSecure,
  WALLET_PAID_STATUSES,
} from "../wallet";
import { clearCachedWalletOrder, getOrCreateWalletOrderId } from "../wallet-order-cache";

const ECARTPAY_SDK_SRC = "https://pay.ecart.com/sdk/pay.js";
/** Espera máxima al SDK de wallets antes de darlo por no disponible. */
const SDK_WAIT_MS = 8000;
/** Margen para que el SDK marque "ready" (el botón tarda en pintarse). */
const READY_DELAY_MS = 2800;
const APPLE_DETECTION_INTERVAL_MS = 300;
const APPLE_DETECTION_MAX_ATTEMPTS = 10; // ~3 s para que un navegador in-app inyecte ApplePaySession
const GOOGLE_3DS_POLL_MS = 3000;
const GOOGLE_3DS_MAX_MS = 5 * 60 * 1000;
const GOOGLE_3DS_OVERLAY_ID = "ecartpay-3ds-overlay";

type WalletProvider = "apple" | "google";

/** Superficie mínima del SDK de EcartPay (`window.Pay.ApplePay` / `window.Pay.GooglePay`). */
interface WalletSdk {
  on(event: string, handler: (event?: any) => unknown): void; // eslint-disable-line @typescript-eslint/no-explicit-any
  render(options: Record<string, unknown>): void;
}

interface WalletWindow {
  ApplePaySession?: { canMakePayments?: () => boolean };
  Pay?: { ApplePay?: WalletSdk; GooglePay?: WalletSdk };
}

const wallet = () => window as unknown as WalletWindow;

/** Lo que cada app arma para crear la orden de wallet (misma fuente para Apple y Google). */
export interface WalletOrderPlan {
  /** Entrada del fingerprint de la caché de orden (carrito + propina + descuento + total). */
  fingerprint: FingerprintInput;
  /** Cuerpo de `POST /payments/{apple,google}-pay/order`. */
  request: WalletOrderRequest;
}

export interface ApplePaySuccessInfo {
  orderId: string;
  /** `event.detail.id` del SDK o, si no viene, la orden. */
  paymentId: string;
  event: unknown;
}

export interface GooglePaySuccessInfo {
  orderId: string;
  paymentId: string;
  /** `event.detail.token`; `null` si el éxito se detectó por el polling del 3DS. */
  token: string | null;
}

export interface UseWalletPaymentsOptions {
  paymentService: Pick<
    PaymentService,
    "createApplePayOrder" | "createGooglePayOrder" | "getEcartOrderStatus"
  >;
  /**
   * El proveedor de pago resuelto permite wallets de EcartPay. Solo gobierna la
   * carga del SDK (no la creación de órdenes). Por defecto, `true`.
   */
  sdkEnabled?: boolean;
  /**
   * Cuándo se puede pedir la orden de wallet. Es la condición que cada app ya
   * tenía en su effect (carrito/descuento cargados, total > 0...). El hook no
   * cambia el momento: la orden se pide en cuanto esto es `true` (hoy, al cargar
   * la pantalla; ver audit R7).
   */
  canCreateOrders: boolean;
  /**
   * Igual al arreglo de dependencias que tenía el effect de la app, serializado:
   * cuando cambia y la orden falló, se vuelve a intentar.
   */
  orderKey: string;
  /** Total (con comisión) que se muestra en el botón de la wallet. */
  amount: number;
  /** Arma fingerprint y cuerpo de la orden con el estado actual de la pantalla. */
  prepareOrder: (provider: WalletProvider) => WalletOrderPlan;
  /** Se llama justo después de obtener (o recuperar de caché) el id de la orden. */
  onOrderCreated?: (provider: WalletProvider, orderId: string) => void;
  /** El SDK autorizó el pago. El hook ya limpió la caché y marcó "procesando". */
  onApplePaySuccess?: (info: ApplePaySuccessInfo) => unknown;
  onGooglePaySuccess?: (info: GooglePaySuccessInfo) => unknown;
  /** Un intento real de pago con Google Pay falló (el botón ya estaba listo). */
  onGooglePayPaymentError?: (error: unknown) => void;
  /** Sustituto del guard de HTTPS (para tests). */
  isSecureDocument?: () => boolean;
  apple?: {
    /** Apple Pay apagado por la app: se oculta y no se piden órdenes. */
    disabled?: boolean;
    /**
     * `"retry"` (por defecto) reintenta ~3 s detectar `ApplePaySession` (navegadores
     * in-app lo inyectan tarde); `"once"` revisa una sola vez al montar.
     */
    detection?: "retry" | "once";
    /** Con `detection: "once"` y sin `ApplePaySession`: ocultar (`"unavailable"`, por defecto) o ignorar. */
    onUnsupported?: "unavailable" | "ignore";
    /** Etiqueta de la hoja de Apple Pay. Sin valor, no se manda. */
    label?: string;
  };
  google?: {
    /** Google Pay apagado por la app. */
    disabled?: boolean;
    /**
     * Pedir la orden de Google Pay aunque ya esté marcado como no disponible
     * (iOS, Safari de escritorio). Es lo que hacen hoy Pick & Go y FlexBill;
     * las demás apps no la piden. Se conserva tal cual (audit R7).
     */
    createOrderWhenUnavailable?: boolean;
    /**
     * Id de pago que se entrega a `onGooglePaySuccess`: `"activity_id"` usa
     * `event.detail.activity_id` y cae a la orden; `"order_id"` (por defecto) siempre la orden.
     */
    paymentId?: "activity_id" | "order_id";
  };
}

/** Los mismos navegadores donde Google Pay no aplica: iOS y Safari de escritorio. */
function isAppleBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (ua.includes("Macintosh") && navigator.vendor === "Apple Computer, Inc.")
  );
}

function ensureEcartPaySdkScript(onError: () => void): void {
  if (document.querySelector(`script[src="${ECARTPAY_SDK_SRC}"]`)) return;
  const script = document.createElement("script");
  script.src = ECARTPAY_SDK_SRC;
  script.async = true;
  script.onerror = onError;
  document.head.appendChild(script);
}

/**
 * Espera `window.Pay.<name>`. Si el SDK no carga (p. ej. el script da 404)
 * resuelve `null` a los 8 s, para que el botón caiga a "no disponible" en vez
 * de quedarse cargando para siempre.
 */
function waitForWalletSdk(name: "ApplePay" | "GooglePay"): Promise<WalletSdk | null> {
  return new Promise((resolve) => {
    const current = wallet().Pay?.[name];
    if (current) return resolve(current);
    const start = Date.now();
    const interval = setInterval(() => {
      const sdk = wallet().Pay?.[name];
      if (sdk) {
        clearInterval(interval);
        resolve(sdk);
      } else if (Date.now() - start > SDK_WAIT_MS) {
        clearInterval(interval);
        resolve(null);
      }
    }, 100);
  });
}

function extractOrderId(result: unknown): string | null {
  const r = result as { orderId?: string; data?: { orderId?: string } };
  return r.orderId ?? r.data?.orderId ?? null;
}

/**
 * Apple Pay y Google Pay con el SDK de EcartPay, extraídos de las cinco
 * `card-selection`. Conserva al pie de la letra lo que ya hacían:
 *
 * - la orden se pide en cuanto `canCreateOrders` es `true` (al cargar la
 *   pantalla, no al pulsar el botón; audit R7), con la caché por fingerprint
 *   (`even-applepay-order` / `even-googlepay-order`) y los mismos endpoints;
 * - la app arma fingerprint y cuerpo (`prepareOrder`) y reacciona al pago
 *   (`onApplePaySuccess`, `onGooglePaySuccess`...);
 * - un 4xx con código semántico oculta las wallets y pide tarjeta guardada
 *   (`walletOrderRejected`); un 5xx pasajero no las oculta;
 * - Google Pay confirma por polling cuando el recibo 3DS no avisa;
 * - Apple Pay no se inicia en un documento no HTTPS (guard de redesign).
 *
 * Los callbacks se toman del render en que corrió el effect de la orden, igual
 * que las closures de las páginas originales.
 */
export function useWalletPayments(options: UseWalletPaymentsOptions) {
  const optionsRef = useRef(options);
  // Va antes que el resto de effects: así ven las opciones de este render.
  useEffect(() => {
    optionsRef.current = options;
  });

  const [applePayReady, setApplePayReady] = useState(false);
  const [applePayUnavailable, setApplePayUnavailable] = useState(false);
  // La orden de wallet fue rechazada de forma definitiva: se ocultan Apple y
  // Google Pay y se pide pagar con tarjeta guardada.
  const [walletOrderRejected, setWalletOrderRejected] = useState(false);
  const [isApplePayProcessing, setIsApplePayProcessing] = useState(false);
  const [applePayPaymentId, setApplePayPaymentId] = useState<string | null>(null);

  const [googlePayReady, setGooglePayReady] = useState(false);
  const [googlePayUnavailable, setGooglePayUnavailable] = useState<boolean>(isAppleBrowser);
  const [isGooglePayProcessing, setIsGooglePayProcessing] = useState(false);
  const [googlePayPaymentId, setGooglePayPaymentId] = useState<string | null>(null);

  const applePayListenersRef = useRef(false);
  const googlePayListenersRef = useRef(false);
  // Reflejan *Ready sin closures obsoletos dentro de los listeners del SDK
  // (se registran una sola vez con `.on(...)`).
  const applePayReadyRef = useRef(false);
  const googlePayReadyRef = useRef(false);
  const googlePaySucceededRef = useRef(false);
  const googlePay3dsObserverRef = useRef<MutationObserver | null>(null);
  const googlePay3dsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopGooglePay3dsWatch = () => {
    googlePay3dsObserverRef.current?.disconnect();
    googlePay3dsObserverRef.current = null;
    if (googlePay3dsPollRef.current) clearInterval(googlePay3dsPollRef.current);
    googlePay3dsPollRef.current = null;
  };
  useEffect(() => stopGooglePay3dsWatch, []);

  const { canCreateOrders, orderKey } = options;
  const googleOrderBlocked = options.google?.createOrderWhenUnavailable ? false : googlePayUnavailable;
  const sdkEnabled = options.sdkEnabled !== false;

  const isSecure = (o: UseWalletPaymentsOptions) =>
    (o.isSecureDocument ?? isWalletDocumentSecure)();

  // Verificar soporte de Apple Pay y cargar el SDK solo si aplica.
  useEffect(() => {
    const o = optionsRef.current;
    const a = o.apple ?? {};
    if (a.disabled) {
      setApplePayUnavailable(true);
      return;
    }
    if (!sdkEnabled) return; // esperar a que se resuelva el proveedor

    // Apple Pay solo funciona sobre HTTPS: en un documento inseguro el SDK
    // lanza InvalidAccessError, así que ni se carga y se cae a tarjeta guardada.
    if (!isSecure(o)) {
      setApplePayUnavailable(true);
      return;
    }

    const loadSDK = () => ensureEcartPaySdkScript(() => setApplePayUnavailable(true));
    const supported = () => !!wallet().ApplePaySession?.canMakePayments?.();

    if ((a.detection ?? "retry") === "once") {
      if (!supported()) {
        if ((a.onUnsupported ?? "unavailable") === "unavailable") setApplePayUnavailable(true);
        return;
      }
      loadSDK();
      return;
    }

    // En navegadores in-app (Instagram, Facebook, TikTok) el puente nativo que
    // inyecta `ApplePaySession` puede tardar: un chequeo único al montar a
    // veces corre antes. Se reintenta un rato en vez de rendirse de una.
    if (supported()) {
      loadSDK();
      return;
    }
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      const found = supported();
      if (found) loadSDK();
      if (found || attempts >= APPLE_DETECTION_MAX_ATTEMPTS) {
        clearInterval(interval);
        // Nunca apareció ApplePaySession: el navegador no lo soporta.
        if (!found) setApplePayUnavailable(true);
      }
    }, APPLE_DETECTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sdkEnabled]);

  // Verificar soporte de Google Pay y cargar el SDK solo si aplica.
  useEffect(() => {
    const g = optionsRef.current.google ?? {};
    if (g.disabled) {
      setGooglePayUnavailable(true);
      return;
    }
    if (!sdkEnabled) return;
    if (googlePayUnavailable) return;
    ensureEcartPaySdkScript(() => setGooglePayUnavailable(true));
  }, [sdkEnabled, googlePayUnavailable]);

  // Orden de Apple Pay: se pide una vez en cuanto la pantalla está lista.
  useEffect(() => {
    const o = optionsRef.current;
    if (o.apple?.disabled) return;
    if (!canCreateOrders || typeof window === "undefined") return;
    // El SDK lanza InvalidAccessError si se inicia Apple Pay en un documento inseguro.
    if (!isSecure(o)) return;
    if (applePayListenersRef.current) return;
    applePayListenersRef.current = true;

    (async () => {
      try {
        let rejection: unknown = null;
        const plan = o.prepareOrder("apple");
        const appleOrderId = await getOrCreateWalletOrderId("apple", plan.fingerprint, async () => {
          const orderResult = await o.paymentService.createApplePayOrder(plan.request);
          const id = extractOrderId(orderResult);
          if (!orderResult.success || !id) {
            rejection = orderResult;
            return null;
          }
          return id;
        });

        if (!appleOrderId) {
          console.warn("⚠️ [AP-ORDER] No se pudo crear la orden:", rejection);
          // Un 4xx con código semántico es un rechazo definitivo (400
          // baseAmount <= 0, 422 payment_rejected, ...): reintentar con los
          // mismos datos fallaría igual, así que se cae a tarjeta guardada. Un
          // 5xx pasajero no oculta la wallet.
          if (rejection && isDefinitiveWalletRejection(rejection as Parameters<typeof isDefinitiveWalletRejection>[0])) {
            setApplePayUnavailable(true);
            setWalletOrderRejected(true);
          }
          applePayListenersRef.current = false;
          return;
        }

        o.onOrderCreated?.("apple", appleOrderId);

        const sdkAlreadyLoaded = !!wallet().Pay?.ApplePay;
        const applePaySDK = await waitForWalletSdk("ApplePay");
        if (!applePaySDK) {
          console.warn("⚠️ [AP-SDK] SDK no disponible en window.Pay.ApplePay");
          setApplePayUnavailable(true);
          applePayListenersRef.current = false;
          return;
        }

        const markReady = () =>
          setTimeout(() => {
            applePayReadyRef.current = true;
            setApplePayReady(true);
          }, READY_DELAY_MS);

        applePaySDK.on("ready", markReady);
        applePaySDK.on("unavailable", () => setApplePayUnavailable(true));
        applePaySDK.on("cancel", () => setIsApplePayProcessing(false));
        applePaySDK.on("error", (err) => {
          // Este evento también dispara en la inicialización del SDK (no solo
          // en un intento real de pago), así que no siempre implica que Apple
          // Pay dejó de estar disponible. Si el botón ya se había mostrado
          // (init exitoso), es un error de un intento real —p. ej. tarjeta
          // rechazada— y el usuario debe poder reintentar, así que no se oculta.
          console.error("❌ Apple Pay error:", err);
          setIsApplePayProcessing(false);
          if (!applePayReadyRef.current) {
            setApplePayUnavailable(true);
          }
        });
        applePaySDK.on("success", (event) => {
          clearCachedWalletOrder("apple");
          const paymentId: string = event?.detail?.id || appleOrderId;
          setApplePayPaymentId(paymentId);
          setIsApplePayProcessing(true);
          return o.onApplePaySuccess?.({ orderId: appleOrderId, paymentId, event });
        });

        applePaySDK.render({
          container: "#apple-pay-container",
          orderId: appleOrderId,
          amount: o.amount,
          currency: "MXN",
          countryCode: "MX",
          ...(o.apple?.label !== undefined && { label: o.apple.label }),
          buttonStyle: "black",
          buttonType: "pay",
          borderRadius: "8px",
          supportedNetworks: ["visa", "masterCard"],
        });

        // Si el SDK ya estaba cargado (segunda+ navegación), "ready" no se re-emite.
        if (sdkAlreadyLoaded) markReady();
      } catch (err) {
        applePayListenersRef.current = false;
        console.error("❌ Error inicializando Apple Pay:", err);
      }
    })();
  }, [canCreateOrders, orderKey]);

  // Orden de Google Pay: igual que Apple Pay, más el 3DS por polling.
  useEffect(() => {
    const o = optionsRef.current;
    if (o.google?.disabled) return;
    if (!canCreateOrders || typeof window === "undefined") return;
    if (googleOrderBlocked) return;
    if (googlePayListenersRef.current) return;
    googlePayListenersRef.current = true;

    (async () => {
      try {
        let rejection: unknown = null;
        const plan = o.prepareOrder("google");
        const googleOrderId = await getOrCreateWalletOrderId("google", plan.fingerprint, async () => {
          const orderResult = await o.paymentService.createGooglePayOrder(plan.request);
          const id = extractOrderId(orderResult);
          if (!orderResult.success || !id) {
            rejection = orderResult;
            return null;
          }
          return id;
        });

        if (!googleOrderId) {
          console.warn("⚠️ [GP-ORDER] No se pudo crear la orden:", rejection);
          if (rejection && isDefinitiveWalletRejection(rejection as Parameters<typeof isDefinitiveWalletRejection>[0])) {
            setGooglePayUnavailable(true);
            setWalletOrderRejected(true);
          }
          googlePayListenersRef.current = false;
          return;
        }

        o.onOrderCreated?.("google", googleOrderId);

        const sdkAlreadyLoaded = !!wallet().Pay?.GooglePay;
        const googlePaySDK = await waitForWalletSdk("GooglePay");
        if (!googlePaySDK) {
          console.warn("⚠️ [GP-SDK] SDK no disponible en window.Pay.GooglePay");
          setGooglePayUnavailable(true);
          googlePayListenersRef.current = false;
          return;
        }

        const markReady = () =>
          setTimeout(() => {
            googlePayReadyRef.current = true;
            setGooglePayReady(true);
          }, READY_DELAY_MS);

        googlePaySDK.on("ready", markReady);
        googlePaySDK.on("unavailable", () => setGooglePayUnavailable(true));
        googlePaySDK.on("cancel", () => setIsGooglePayProcessing(false));
        googlePaySDK.on("error", (err) => {
          // Mismo criterio que en Apple Pay: solo un error con el botón ya
          // listo es un intento de pago real que se muestra al usuario.
          console.error("❌ Google Pay error:", err);
          setIsGooglePayProcessing(false);
          stopGooglePay3dsWatch();
          if (classifyGooglePayError(googlePayReadyRef.current) === "payment") {
            o.onGooglePayPaymentError?.(err);
          } else {
            setGooglePayUnavailable(true);
          }
        });

        const handleGooglePaySuccess = (paymentId: string, token: string | null) => {
          if (googlePaySucceededRef.current) return;
          googlePaySucceededRef.current = true;
          stopGooglePay3dsWatch();
          clearCachedWalletOrder("google");
          setGooglePayPaymentId(paymentId);
          setIsGooglePayProcessing(true);
          return o.onGooglePaySuccess?.({ orderId: googleOrderId, paymentId, token });
        };

        googlePaySDK.on("success", (event) =>
          handleGooglePaySuccess(
            o.google?.paymentId === "activity_id"
              ? event?.detail?.activity_id || googleOrderId
              : googleOrderId,
            event?.detail?.token || null,
          ),
        );

        // El SDK abre cualquier redirect_url de process-payment en un overlay
        // y solo emite "success" si el iframe manda postMessage; la página de
        // recibo de EcartPay no lo manda, así que se confirma por polling.
        const isOrderPaid = async () => {
          const status = await o.paymentService.getEcartOrderStatus(googleOrderId);
          return !!status && WALLET_PAID_STATUSES.includes(status);
        };
        const finishFromOverlay = () => {
          document.getElementById(GOOGLE_3DS_OVERLAY_ID)?.remove();
          handleGooglePaySuccess(googleOrderId, null);
        };
        const startPolling = async (overlay: HTMLElement) => {
          if (googlePay3dsPollRef.current) return;
          const startedAt = Date.now();
          googlePay3dsPollRef.current = setInterval(async () => {
            if (Date.now() - startedAt > GOOGLE_3DS_MAX_MS) {
              stopGooglePay3dsWatch();
              return;
            }
            if (await isOrderPaid()) finishFromOverlay();
          }, GOOGLE_3DS_POLL_MS);
          // Oculto mientras se revisa: si ya está pagada es el recibo y no se
          // muestra; si no, es un reto 3DS real y se deja visible.
          overlay.style.visibility = "hidden";
          if (await isOrderPaid()) finishFromOverlay();
          else overlay.style.visibility = "";
        };
        googlePay3dsObserverRef.current?.disconnect();
        googlePay3dsObserverRef.current = new MutationObserver(() => {
          const overlay = document.getElementById(GOOGLE_3DS_OVERLAY_ID);
          if (overlay) startPolling(overlay);
        });
        googlePay3dsObserverRef.current.observe(document.body, { childList: true });

        googlePaySDK.render({
          container: "#google-pay-container",
          orderId: googleOrderId,
          amount: o.amount,
          currency: "MXN",
          countryCode: "MX",
          allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"],
          allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
          buttonColor: "black",
          buttonType: "pay",
        });

        if (sdkAlreadyLoaded) markReady();
      } catch (err) {
        googlePayListenersRef.current = false;
        console.error("❌ Error inicializando Google Pay:", err);
      }
    })();
  }, [canCreateOrders, orderKey, googleOrderBlocked]);

  return {
    applePayReady,
    applePayUnavailable,
    walletOrderRejected,
    isApplePayProcessing,
    setIsApplePayProcessing,
    applePayPaymentId,
    googlePayReady,
    googlePayUnavailable,
    isGooglePayProcessing,
    setIsGooglePayProcessing,
    googlePayPaymentId,
  };
}

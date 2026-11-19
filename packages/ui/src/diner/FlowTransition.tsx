"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import { FlowCard } from "../components/flow-card";
import {
  FlowNavOverlay,
  type FlowScreen,
  type FlowScreenContext,
  type FlowScreenSource,
} from "../components/flow-nav-overlay";
import {
  getPreviousFlowPath,
  markNavigation,
  startPopstateListener,
  startRouteBack,
  startRouteTransition,
  useFlowStepReady,
  type FlowTiming,
} from "../lib/route-transition";
import { formatMoney, setFlowAmount } from "../lib/flow-amount";
import RouteTransitionGate from "./RouteTransitionGate";

type FlowTransitionValue = {
  steps: readonly string[];
  screens: Record<string, FlowScreenSource>;
  timing?: Partial<FlowTiming>;
};

const FlowTransitionContext = createContext<FlowTransitionValue>({ steps: [], screens: {} });

export type FlowTransitionProviderProps = {
  /** Pasos del flujo (segmentos de ruta) que se animan entre sí. */
  steps: readonly string[];
  /** Pantalla de cada paso: título, esqueleto y forma de la tarjeta (ver `cartScreen`, `tipScreen`...). */
  screens: Record<string, FlowScreenSource>;
  /** Cabecera con el botón de volver (solo visual) que lleva el esqueleto. */
  header: ReactNode;
  /** Tiempos de la animación; por defecto los de `DEFAULT_FLOW_TIMING`. */
  timing?: Partial<FlowTiming>;
  children: ReactNode;
};

/**
 * Animación de tarjeta del flujo de compra, entera en un solo lugar. Va en el layout de la app, alrededor de las
 * rutas del flujo, y monta: el registro del historial de vistas (`RouteTransitionGate`), el listener de
 * `popstate` (gesto/botón atrás del navegador) y el esqueleto del paso destino (`FlowNavOverlay`).
 * Las vistas navegan con `useFlowNavigation` y pintan su tarjeta con `FlowStepCard`.
 */
export function FlowTransitionProvider({ steps, screens, header, timing, children }: FlowTransitionProviderProps) {
  const { leaveMs, enterMs, maxWaitMs } = timing ?? {};
  const options = useMemo(() => ({ leaveMs, enterMs, maxWaitMs }), [leaveMs, enterMs, maxWaitMs]);
  const value = useMemo(() => ({ steps, screens, timing: options }), [steps, screens, options]);

  useEffect(() => startPopstateListener(steps, options), [steps, options]);

  return (
    <FlowTransitionContext.Provider value={value}>
      <RouteTransitionGate />
      {children}
      <FlowNavOverlay screens={screens} header={header} />
    </FlowTransitionContext.Provider>
  );
}

/**
 * Navegación del flujo: envuelve el router de Next con la animación de tarjeta.
 * - `push` / `replace`: la tarjeta actual baja y sube el esqueleto del paso destino (si ambos son pasos).
 * - `back(fallbackUrl?)`: vuelve a la vista anterior con la misma animación; si no hay historial previo
 *   (entró directo a la vista, recarga sin pila) navega a `fallbackUrl` con transición.
 */
export function useFlowNavigation() {
  const router = useRouter();
  const { steps, timing } = useContext(FlowTransitionContext);

  const push = useCallback(
    (url: string) =>
      startRouteTransition(
        url,
        () => {
          markNavigation("push");
          router.push(url);
        },
        steps,
        timing,
      ),
    [router, steps, timing],
  );

  const replace = useCallback(
    (url: string) =>
      startRouteTransition(
        url,
        () => {
          markNavigation("replace");
          router.replace(url);
        },
        steps,
        timing,
      ),
    [router, steps, timing],
  );

  const back = useCallback(
    (fallbackUrl?: string) => {
      if (fallbackUrl && !getPreviousFlowPath()) {
        push(fallbackUrl);
        return;
      }
      startRouteBack(() => router.back(), steps, timing);
    },
    [router, steps, timing, push],
  );

  return useMemo(() => ({ push, replace, back }), [push, replace, back]);
}

function resolveScreen(source: FlowScreenSource | undefined, context: FlowScreenContext): FlowScreen | undefined {
  return typeof source === "function" ? source(context) : source;
}

export type FlowStepCardProps = {
  /** Paso (segmento de ruta) cuya pantalla se usa; debe estar en `screens` del provider. */
  step: string;
  /** La vista aún no tiene los datos que cambian su estructura: muestra el esqueleto del paso y no retira el de la transición. */
  loading?: boolean;
  /** La vista pinta su propio estado de carga dentro de la tarjeta: solo mantiene el esqueleto de la transición hasta que pase a `false`. */
  waiting?: boolean;
  /** Título distinto al de la pantalla (p. ej. con un filtro al lado). */
  hero?: React.ReactNode;
  heroClassName?: string;
  /** Sustituye la forma de la tarjeta de la pantalla solo si la vista real necesita otra. */
  layout?: FlowScreen["layout"];
  cardClassName?: string;
  /** Clases del contenedor de la hoja. */
  className?: string;
  /** Estilos del título y de la tarjeta (p. ej. la animación de la hoja del carrito sobre el menú). */
  heroStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  /** Anima los cambios de altura del contenido (solo `anchored`). */
  animateHeight?: boolean;
  children: ReactNode;
};

/**
 * Hoja (título + tarjeta) de la vista real de un paso. Toma título, forma y esqueleto de la misma pantalla que
 * pinta la transición, así la tarjeta que sube y la vista ya cargada miden lo mismo. Mientras `loading`, muestra
 * el esqueleto y mantiene la transición hasta que haya datos.
 */
export function FlowStepCard({
  step,
  loading = false,
  waiting = false,
  hero,
  heroClassName,
  layout,
  cardClassName,
  className,
  heroStyle,
  cardStyle,
  animateHeight,
  children,
}: FlowStepCardProps) {
  const { screens } = useContext(FlowTransitionContext);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const screen = resolveScreen(screens[step], {
    step,
    path: search ? `${pathname}?${search}` : pathname,
    params: new URLSearchParams(search),
  });

  useFlowStepReady(!(loading || waiting));

  return (
    <FlowCard
      hero={hero ?? screen?.hero}
      heroClassName={heroClassName ?? screen?.heroClassName}
      layout={layout ?? screen?.layout ?? (screen?.anchored ? "anchored" : "fill")}
      cardClassName={cardClassName ?? screen?.cardClassName}
      className={className ?? screen?.frameClassName}
      heroStyle={heroStyle}
      cardStyle={cardStyle}
      animateHeight={animateHeight}
    >
      {loading && screen ? screen.body : children}
    </FlowCard>
  );
}

export type FlowAmountInput = {
  /** Lo que cobra el botón de pagar: el mismo número que usa la tarjeta de la vista. */
  total: number;
  /** Desglose: cuenta/consumo, propina y comisión de servicio (solo si el servicio se la cobra al cliente). */
  bill?: number;
  /** Texto de la cuenta si no es "Cuenta" (p. ej. "Tu parte"). */
  billLabel?: string;
  tip?: number;
  commission?: number;
  /** Costo de pagar a meses sin intereses. */
  financing?: number;
  /** Etiqueta distinta a "Total a pagar" (p. ej. el saldo de la mesa). */
  label?: string;
  /** Desglose ya armado; sustituye al de bill/tip/commission. */
  breakdown?: string;
};

/**
 * Publica el monto vivo de la vista para el hero del paso (`AmountHero`). Cada vista lo llama con el mismo `total`
 * que usa su tarjeta y su botón de pagar, así el hero nunca recalcula nada. `null` mientras no hay datos; al
 * desmontar se retira. Las etiquetas del desglose salen de `Common` (`heroBill`, `heroTip`, `heroCommission`).
 */
export function useFlowAmount(input: FlowAmountInput | null) {
  const t = useTranslations("Common");
  const total = input ? formatMoney(input.total) : null;
  const label = input?.label;
  const breakdown = input ? (input.breakdown ?? buildBreakdown(input, t)) : undefined;

  useLayoutEffect(() => {
    setFlowAmount(total == null ? null : { total, breakdown: breakdown || undefined, label });
  }, [total, breakdown, label]);
  useLayoutEffect(() => () => setFlowAmount(null), []);
}

const cents = (n: number) => Math.round(n * 100);

/**
 * "Cuenta $46.00 + propina $4.60". Omite los componentes en 0 y, si solo queda uno igual al total, no hay desglose
 * (la línea conserva su alto en el hero para que el monto no se mueva).
 */
function buildBreakdown(input: FlowAmountInput, t: (key: string) => string): string | undefined {
  const parts = [
    { label: input.billLabel ?? t("heroBill"), value: input.bill },
    { label: t("heroTip"), value: input.tip },
    { label: t("heroCommission"), value: input.commission },
    { label: t("heroFinancing"), value: input.financing },
  ].filter((part): part is { label: string; value: number } => part.value != null && cents(part.value) > 0);
  if (parts.length === 0 || (parts.length === 1 && cents(parts[0].value) === cents(input.total))) return undefined;
  return parts.map((part) => `${part.label} ${formatMoney(part.value)}`).join(" + ");
}

"use client";

import { Loader2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Ghost, type FlowScreen } from "../components/flow-nav-overlay";
import { FlowStepCard } from "./FlowTransition";

const TIP_OPTIONS = [0, 10, 15, 20];
const MIN_PEOPLE = 2;
const MAX_PEOPLE = 50;
// A partir de aquí el anillo se queda en este número de segmentos.
const MAX_RING_SEGMENTS = 15;

const RADIUS = 86;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TWEEN_MS = 320;

// Interpola el número de personas para que el anillo se reparta de forma
// continua (el segmento nuevo crece desde 0) en vez de empalmar arcos.
function useTweened(target: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min((now - start) / TWEEN_MS, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

type Props = {
  /** Paso del flujo cuya tarjeta pinta (por defecto la propina). */
  step?: string;
  tableNumber: string | null | undefined;
  remaining: number;
  share: number;
  people: number;
  onPeopleChange: (people: number) => void;
  tipPercentage: number;
  showCustomTip: boolean;
  customTip: string;
  onTipPercentage: (percentage: number) => void;
  onCustomTipOpen: () => void;
  onCustomTipChange: (value: string) => void;
  tipAmount: number;
  total: number;
  isUnderMinimum: boolean;
  disabled: boolean;
  loading?: boolean;
  onContinue: () => void;
};

type Segment = { start: number; length: number };

function ringSegments(p: number): {
  slice: number;
  yours: Segment;
  rest: Segment[];
} {
  const slice = CIRCUMFERENCE / p;
  const full = Math.floor(p);
  const rest: Segment[] = [];
  for (let i = 1; i < full; i++) rest.push({ start: i * slice, length: slice });
  const partial = CIRCUMFERENCE - full * slice;
  if (partial > 0.01) rest.push({ start: full * slice, length: partial });
  return { slice, yours: { start: 0, length: slice }, rest };
}

function SplitRing({ people }: { people: number }) {
  const { slice, yours, rest } = ringSegments(
    useTweened(Math.min(people, MAX_RING_SEGMENTS)),
  );
  // Separación entre segmentos: se achica con muchos para que sigan visibles.
  const gapFull = STROKE + Math.min(12, slice * 0.15);

  // El segmento que entra o sale se dibuja más delgado en proporción, así
  // crece desde un punto sin encimarse.
  const arc = (seg: Segment, color: string, key: string) => {
    const k = Math.min(1, seg.length / slice);
    if (k <= 0.01) return null;
    const gap = gapFull * k;
    const visible = Math.max(seg.length - gap, 0.001);
    return (
      <circle
        key={key}
        cx="100"
        cy="100"
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={STROKE * k}
        strokeLinecap="round"
        strokeDasharray={`${visible} ${CIRCUMFERENCE - visible}`}
        strokeDashoffset={-(seg.start + gap / 2)}
      />
    );
  };

  return (
    <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden>
      {rest.map((s, i) => arc(s, "rgba(255,255,255,0.12)", `rest-${i}`))}
      {arc(yours, "var(--color-even-grass)", "yours")}
    </svg>
  );
}

/**
 * Forma de la tarjeta de "dividir cuenta": título y anillo sobre el verde, controles en una tarjeta del alto de su
 * contenido pegada abajo. La comparten la vista real y el esqueleto de la transición.
 */
const EQUAL_SPLIT_CARD =
  "flex-none px-8 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-10 lg:px-12";

const DISPLAY_FONT = { fontFamily: "var(--font-jakarta), system-ui, sans-serif" };

function EqualSplitHero({
  tableNumber,
  title,
  ring,
  children,
}: {
  tableNumber: string | null | undefined;
  title: React.ReactNode;
  ring: React.ReactNode;
  children: React.ReactNode;
}) {
  const tc = useTranslations("Common");
  return (
    <div className="flex flex-col">
      <div className="px-6 pt-2 md:px-10">
        <p className="text-base text-even-grass/80">{tc("tableLabel", { table: tableNumber ?? "" })}</p>
        <h1 className="mt-1 text-3xl font-bold text-white md:text-4xl" style={DISPLAY_FONT}>
          {title}
        </h1>
      </div>
      <div className="flex items-center justify-center pt-6 pb-12">
        <div className="relative size-64 md:size-72">
          {ring}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pantalla de "dividir cuenta" para la transición (esqueleto con las mismas medidas que la vista real).
 * Se registra en `screens` como variante del paso de propina (`type=equal-shares`): la pantalla puede ser una función de la query del destino.
 */
export function useEqualSplitScreen(tableNumber: string | null | undefined): FlowScreen {
  const t = useTranslations("TipSelectionPage");
  return {
    hero: (
      <EqualSplitHero
        tableNumber={tableNumber}
        title={t("splitTitle")}
        ring={<div aria-hidden className="size-full animate-pulse rounded-full border-[22px] border-white/10" />}
      >
        <Ghost className="text-sm md:text-base">{t("yourShareTitle")}</Ghost>
        <Ghost className="text-5xl leading-tight font-bold md:text-6xl">$000.00</Ghost>
        <Ghost className="text-sm md:text-base">{t("ofAmount", { amount: "000.00" })}</Ghost>
      </EqualSplitHero>
    ),
    body: (
      <>
        <div className="flex items-center justify-between">
          <div className="size-14 animate-pulse rounded-full bg-tone-100" />
          <div className="flex items-baseline gap-2">
            <Ghost className="text-4xl font-bold">2</Ghost>
            <span className="text-lg text-even-evergreen">{t("peopleUnit")}</span>
          </div>
          <div className="size-14 animate-pulse rounded-full bg-even-grass/40" />
        </div>
        <div className="mt-5 flex items-center gap-4">
          <span className="text-base font-medium whitespace-nowrap text-black md:text-lg lg:text-xl">{t("tipLabel")}</span>
          <div className="grid flex-1 grid-cols-5 gap-2">
            {["0%", "10%", "15%", "20%", "$"].map((label) => (
              <div
                key={label}
                className="animate-pulse rounded-full border border-transparent bg-tone-100 py-1 md:py-1.5 lg:py-2"
              >
                <span className="invisible">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-tone-200 pt-5">
          <Ghost className="text-3xl font-bold">$000.00</Ghost>
          <div className="h-14 max-w-48 flex-1 animate-pulse rounded-full bg-even-grass/40" />
        </div>
      </>
    ),
    layout: "anchored",
    cardClassName: EQUAL_SPLIT_CARD,
  };
}

export default function EqualSplitView({
  step = "tip-selection",
  tableNumber,
  remaining,
  share,
  people,
  onPeopleChange,
  tipPercentage,
  showCustomTip,
  customTip,
  onTipPercentage,
  onCustomTipOpen,
  onCustomTipChange,
  tipAmount,
  total,
  isUnderMinimum,
  disabled,
  loading = false,
  onContinue,
}: Props) {
  const t = useTranslations("TipSelectionPage");
  const display = DISPLAY_FONT;

  const chipClass = (active: boolean) =>
    `py-1 md:py-1.5 lg:py-2 rounded-full border border-stroke/40 text-black transition-colors cursor-pointer ${
      active
        ? "bg-even-grass text-even-evergreen"
        : "bg-surface hover:border-tone-400"
    }`;

  return (
    <FlowStepCard
      step={step}
      layout="anchored"
      cardClassName={EQUAL_SPLIT_CARD}
      hero={<EqualSplitHero tableNumber={tableNumber} title={t("splitTitle")} ring={<SplitRing people={people} />}>
        <span className="text-white/80 text-sm md:text-base">{t("yourShareTitle")}</span>
        <span className="text-white text-5xl md:text-6xl font-bold leading-tight" style={display}>
          ${share.toFixed(2)}
        </span>
        <span className="text-white/80 text-sm md:text-base">{t("ofAmount", { amount: remaining.toFixed(2) })}</span>
      </EqualSplitHero>}
    >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onPeopleChange(Math.max(MIN_PEOPLE, people - 1))}
            disabled={people <= MIN_PEOPLE}
            aria-label={t("fewerPeople")}
            className="size-14 rounded-full bg-even-offwhite text-even-evergreen flex items-center justify-center transition-transform active:scale-90 disabled:text-stroke-soft disabled:active:scale-100 cursor-pointer disabled:cursor-not-allowed"
          >
            <Minus className="size-6" />
          </button>
          <div className="flex items-baseline gap-2">
            <span
              className="text-even-evergreen text-4xl font-bold"
              style={display}
            >
              {people}
            </span>
            <span className="text-even-evergreen text-lg">
              {t("peopleUnit")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onPeopleChange(Math.min(MAX_PEOPLE, people + 1))}
            disabled={people >= MAX_PEOPLE}
            aria-label={t("morePeople")}
            className="size-14 rounded-full bg-even-grass text-even-evergreen flex items-center justify-center transition-transform active:scale-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="size-6" />
          </button>
        </div>

        <div className="flex items-center gap-4 mt-5">
          <span className="text-black font-medium text-base md:text-lg lg:text-xl whitespace-nowrap">
            {t("tipLabel")}
          </span>
          <div className="grid grid-cols-5 gap-2 flex-1">
            {TIP_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onTipPercentage(p)}
                className={chipClass(tipPercentage === p && !showCustomTip)}
              >
                {p === 0 ? "0%" : `${p}%`}
              </button>
            ))}
            <button
              type="button"
              onClick={onCustomTipOpen}
              className={chipClass(showCustomTip)}
            >
              $
            </button>
          </div>
        </div>

        {showCustomTip && (
          <div className="relative w-full mt-3">
            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-black text-base">
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={customTip}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d*\.?\d*$/.test(v)) onCustomTipChange(v);
              }}
              placeholder="0.00"
              autoFocus
              className="w-full pl-8 pr-4 py-1 md:py-1.5 lg:py-2 border border-stroke/40 rounded-full focus:outline-none focus:ring focus:ring-tone-400 focus:border-transparent text-black text-center text-base bg-surface"
            />
          </div>
        )}

        {isUnderMinimum && share > 0 && (
          <p className="text-danger-600 text-sm mt-3">
            {t("underMinimumWarning")}
          </p>
        )}

        <div className="border-t border-tone-200 mt-5 pt-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-even-evergreen text-3xl font-bold"
                style={display}
              >
                ${total.toFixed(2)}
              </span>
            </div>
            {tipAmount > 0 && (
              <p className="text-stroke text-sm">
                {t("includesTip", { amount: tipAmount.toFixed(2) })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onContinue}
            disabled={disabled || loading}
            className={`h-14 flex-1 max-w-48 rounded-full bg-even-grass text-even-evergreen text-lg flex items-center justify-center transition-all ${
              disabled
                ? "opacity-50 cursor-not-allowed"
                : "active:scale-95 cursor-pointer shadow-[0_0_0_4px_rgba(130,230,87,0.25)]"
            }`}
          >
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              t("continueCta")
            )}
          </button>
        </div>
    </FlowStepCard>
  );
}


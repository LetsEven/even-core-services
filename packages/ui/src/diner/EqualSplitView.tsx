"use client";

import { Loader2, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  RING_CIRCUMFERENCE,
  RING_RADIUS,
  RING_STROKE,
  isValidTipInput,
  useEqualSplit,
  useSplitRing,
  type RingSegment,
} from "./useEqualSplit";

type Props = {
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

function SplitRing({ people }: { people: number }) {
  const { slice, yours, rest, gapFull } = useSplitRing(people);

  // El segmento que entra o sale se dibuja más delgado en proporción, así
  // crece desde un punto sin encimarse.
  const arc = (seg: RingSegment, color: string, key: string) => {
    const k = Math.min(1, seg.length / slice);
    if (k <= 0.01) return null;
    const gap = gapFull * k;
    const visible = Math.max(seg.length - gap, 0.001);
    return (
      <circle
        key={key}
        cx="100"
        cy="100"
        r={RING_RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={RING_STROKE * k}
        strokeLinecap="round"
        strokeDasharray={`${visible} ${RING_CIRCUMFERENCE - visible}`}
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

export default function EqualSplitView({
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
  const tc = useTranslations("Common");
  const split = useEqualSplit({ people, onPeopleChange });
  const display = { fontFamily: "var(--font-jakarta), system-ui, sans-serif" };

  const chipClass = (active: boolean) =>
    `py-1 md:py-1.5 lg:py-2 rounded-full border border-stroke/40 text-black transition-colors cursor-pointer ${
      active
        ? "bg-even-grass text-even-evergreen"
        : "bg-surface hover:border-tone-400"
    }`;

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-6 md:px-10 pt-2">
        <p className="text-even-grass/80 text-base">
          {tc("tableLabel", { table: tableNumber ?? "" })}
        </p>
        <h1
          className="text-white text-3xl md:text-4xl font-bold mt-1"
          style={display}
        >
          {t("splitTitle")}
        </h1>
      </div>

      <div className="flex-1 flex items-center justify-center py-6">
        <div className="relative size-64 md:size-72">
          <SplitRing people={people} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-white/80 text-sm md:text-base">
              {t("yourShareTitle")}
            </span>
            <span
              className="text-white text-5xl md:text-6xl font-bold leading-tight"
              style={display}
            >
              ${share.toFixed(2)}
            </span>
            <span className="text-white/80 text-sm md:text-base">
              {t("ofAmount", { amount: remaining.toFixed(2) })}
            </span>
          </div>
        </div>
      </div>

      <div
        className="bg-white rounded-t-4xl mx-4 md:mx-6 lg:mx-8 px-8 md:px-10 lg:px-12 pt-6"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={split.decrement}
            disabled={!split.canDecrement}
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
            onClick={split.increment}
            disabled={!split.canIncrement}
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
            {split.tipOptions.map((p) => (
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
                if (isValidTipInput(v)) onCustomTipChange(v);
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
      </div>
    </div>
  );
}

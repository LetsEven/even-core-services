"use client";

import { Loader2, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { AmountHero } from "../components/flow-hero";
import { Ghost, type FlowScreen } from "../components/flow-nav-overlay";
import { PayButton, TipPicker } from "../components/flow-tip";
import { formatMoney } from "../lib/flow-amount";
import { FlowStepCard } from "./FlowTransition";

const MIN_PEOPLE = 2;
const MAX_PEOPLE = 50;

type Props = {
  /** Paso del flujo cuya tarjeta pinta (por defecto la propina). */
  step?: string;
  tableNumber: string | null | undefined;
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

/** Forma de la tarjeta de "dividir cuenta": del alto de su contenido, pegada abajo. */
const EQUAL_SPLIT_CARD = "flex-none px-8 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-10 lg:px-12";

/**
 * Pantalla de "dividir cuenta" para la transición (esqueleto con las mismas medidas que la vista real).
 * Se registra en `screens` como variante del paso de propina (`type=equal-shares`): la pantalla puede ser una función de la query del destino.
 */
export function useEqualSplitScreen(tableNumber: string | null | undefined): FlowScreen {
  const t = useTranslations("TipSelectionPage");
  const tc = useTranslations("Common");
  return {
    hero: (
      <AmountHero
        context={tc("tableLabel", { table: tableNumber ?? "" })}
        title={t("splitTitle")}
        label={tc("totalToPay")}
      />
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
        <div className="mt-6">
          <TipPicker
            label={t("tipLabel")}
            percentage={0}
            showCustom={false}
            customTip=""
            onPercentage={() => {}}
            onCustomOpen={() => {}}
            onCustomChange={() => {}}
          />
        </div>
        <div className="mt-6">
          <PayButton disabled className="animate-pulse bg-even-grass/40">
            <span className="invisible">{tc("payCtaAmount", { amount: "$000.00" })}</span>
          </PayButton>
        </div>
      </>
    ),
    layout: "anchored",
    cardClassName: EQUAL_SPLIT_CARD,
  };
}

export default function EqualSplitView({
  step = "tip-selection",
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
  const display = { fontFamily: "var(--font-jakarta), system-ui, sans-serif" };

  // El monto del hero lo publica la vista de propina con este mismo `total` (`useFlowAmount`).
  return (
    <FlowStepCard step={step} layout="anchored" cardClassName={EQUAL_SPLIT_CARD}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onPeopleChange(Math.max(MIN_PEOPLE, people - 1))}
          disabled={people <= MIN_PEOPLE}
          aria-label={t("fewerPeople")}
          className="flex size-14 cursor-pointer items-center justify-center rounded-full bg-even-offwhite text-even-evergreen transition-transform active:scale-90 disabled:cursor-not-allowed disabled:text-stroke-soft disabled:active:scale-100"
        >
          <Minus className="size-6" />
        </button>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-even-evergreen" style={display}>
            {people}
          </span>
          <span className="text-lg text-even-evergreen">{t("peopleUnit")}</span>
        </div>
        <button
          type="button"
          onClick={() => onPeopleChange(Math.min(MAX_PEOPLE, people + 1))}
          disabled={people >= MAX_PEOPLE}
          aria-label={t("morePeople")}
          className="flex size-14 cursor-pointer items-center justify-center rounded-full bg-even-grass text-even-evergreen transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-6" />
        </button>
      </div>

      <div className="mt-6">
        <TipPicker
          label={t("tipLabel")}
          percentage={tipPercentage}
          showCustom={showCustomTip}
          customTip={customTip}
          onPercentage={onTipPercentage}
          onCustomOpen={onCustomTipOpen}
          onCustomChange={onCustomTipChange}
        />
      </div>

      {isUnderMinimum && share > 0 && <p className="mt-3 text-base text-danger-600">{t("underMinimumWarning")}</p>}

      <div className="mt-6">
        <PayButton onClick={onContinue} disabled={disabled || loading}>
          {loading ? <Loader2 className="size-5 animate-spin" /> : tc("payCtaAmount", { amount: formatMoney(total) })}
        </PayButton>
      </div>
    </FlowStepCard>
  );
}

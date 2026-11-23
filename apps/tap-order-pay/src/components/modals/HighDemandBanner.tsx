"use client";

import { HighDemandBanner as SharedHighDemandBanner } from "@even/ui/diner";

/** Banner compartido con el icono más grande en pantallas md y el botón verde de Tap Order & Pay. */
export default function HighDemandBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <SharedHighDemandBanner
      onDismiss={onDismiss}
      iconClassName="size-16 md:size-20"
      buttonClassName="mt-2 w-full bg-even-grass text-even-evergreen font-semibold py-3.5 rounded-full text-sm hover:opacity-90 transition-opacity active:scale-95"
    />
  );
}

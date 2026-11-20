"use client";

import { HighDemandBanner as SharedHighDemandBanner } from "@even/ui/diner";

/** Banner compartido con el isotipo verde que usa FlexBill. */
export default function HighDemandBanner({ onDismiss }: { onDismiss: () => void }) {
  return <SharedHighDemandBanner onDismiss={onDismiss} iconSrc="/even/even-asterisk-grass.svg" />;
}

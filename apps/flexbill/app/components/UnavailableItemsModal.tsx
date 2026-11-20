"use client";

import { type ComponentProps } from "react";
import { UnavailableItemsModal as SharedUnavailableItemsModal } from "@even/ui/diner";

export { toUnavailableModalItems, type UnavailableModalItem } from "@even/ui/diner";

/** Modal compartido con el botón negro de confirmación que usa FlexBill. */
export default function UnavailableItemsModal(
  props: Omit<ComponentProps<typeof SharedUnavailableItemsModal>, "removeButtonClassName">,
) {
  return (
    <SharedUnavailableItemsModal
      {...props}
      removeButtonClassName="w-full mt-6 md:mt-8 flex items-center justify-center gap-2 bg-black hover:bg-warm-950 text-white text-base md:text-lg lg:text-xl py-3 md:py-4 rounded-full transition-opacity disabled:opacity-50"
    />
  );
}

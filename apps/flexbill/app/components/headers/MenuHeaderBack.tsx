"use client";

import { Restaurant } from "../../interfaces/restaurante";
import { useTableNavigation } from "../../hooks/useTableNavigation";
import { usePathname } from "next/navigation";
import ParticipantsHeader from "./ParticipantsHeader";

interface MenuHeaderProps {
  restaurant: Restaurant;
  tableNumber?: string;
  onBack?: () => void;
}

export default function MenuHeaderBack({
  restaurant,
  tableNumber,
  onBack,
}: MenuHeaderProps) {
  const { back } = useTableNavigation();
  const pathname = usePathname();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (pathname?.includes("payment-options")) {
      // Vuelta real con animación; sin historial previo (entró directo) cae a la cuenta.
      back("/order");
    } else {
      back("/menu");
    }
  };

  return (
    <ParticipantsHeader
      restaurant={restaurant}
      tableNumber={tableNumber}
      onBack={handleBack}
    />
  );
}

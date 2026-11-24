"use client";

import { useEffect, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useRestaurant } from "@/app/context/RestaurantContext";
import { RetailOrderProvider } from "@/app/context/RetailOrderContext";

// La sucursal del QR es todo el contexto: restaurante + orden activa en vivo
export default function BranchLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const { setParams } = useRestaurant();

  useEffect(() => {
    const restaurantId = params?.restaurantId as string;
    const branchNumber = params?.branchNumber as string;
    if (restaurantId && branchNumber) setParams({ restaurantId, branchNumber });
  }, [params, setParams]);

  return <RetailOrderProvider>{children}</RetailOrderProvider>;
}

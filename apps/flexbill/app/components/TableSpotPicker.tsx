"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchRestaurantTables, type Spot } from "@even/api-client";
import { SpotPicker } from "@even/ui";

interface TableSpotPickerProps {
  restaurantId: string | number;
  onSelect: (tableNumber: string) => void;
}

/** Lista las mesas del restaurante con su estatus para abrir una sin escanear el QR. */
export default function TableSpotPicker({ restaurantId, onSelect }: TableSpotPickerProps) {
  const t = useTranslations("SpotPicker");
  const [items, setItems] = useState<Spot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetchRestaurantTables(process.env.NEXT_PUBLIC_API_URL, restaurantId, {
      signal: controller.signal,
    })
      .then((spots) => {
        setItems(spots);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("No se pudieron cargar las mesas", err);
        setFailed(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [restaurantId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <div className="min-h-screen-safe bg-even-evergreen">
      <SpotPicker
        items={items}
        loading={loading}
        failed={failed}
        onSelect={onSelect}
        onRetry={retry}
        labels={{
          title: t("title"),
          subtitle: t("subtitle"),
          spotLabel: (id) => t("spotLabel", { id }),
          statuses: {
            available: t("available"),
            occupied: t("occupied"),
            reserved: t("reserved"),
            unknown: t("unknown"),
          },
          filterAll: t("filterAll"),
          filterAvailable: t("filterAvailable"),
          empty: t("empty"),
          error: t("error"),
          retry: t("retry"),
        }}
      />
    </div>
  );
}

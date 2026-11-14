"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw, ChevronRight, ReceiptText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  pickAndGoService,
  type ActiveOrderData,
  type PickAndGoItem,
  type PickAndGoOrder,
} from "../../services/pickandgo.service";
import { orderProgress, useNow } from "../../lib/orderProgress";
import ItemCustomizations from "../ItemCustomizations";

interface OrdersSheetProps {
  closing: boolean;
  onClose: () => void;
  activeOrders: ActiveOrderData[];
  clientId: string | null | undefined;
  restaurantId: number | undefined;
  /** Abre el detalle de estatus de un pedido en curso. */
  onOpenStatus: (index: number) => void;
  /** Abre el modal de reorden con los platillos del pedido. */
  onReorder: (items: PickAndGoItem[]) => void;
}

const HISTORY_LIMIT = 15;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Hoja que sube desde abajo (mismo estilo que perfil y Pepper) con el pedido
 * en curso y los pedidos anteriores del restaurante, cada uno con "Reordenar".
 */
export default function OrdersSheet({
  closing,
  onClose,
  activeOrders,
  clientId,
  restaurantId,
  onOpenStatus,
  onReorder,
}: OrdersSheetProps) {
  const t = useTranslations("OrdersSheet");
  const tc = useTranslations("Common");
  const [past, setPast] = useState<PickAndGoOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const now = useNow(
    activeOrders.some((o) => o.pick_and_go_order?.cooking_status === "preparing"),
  );
  // Detalle (cristal claro) de un pedido anterior
  const [detail, setDetail] = useState<PickAndGoOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = async (order: PickAndGoOrder) => {
    setDetail(order);
    setDetailLoading(true);
    try {
      const res = await pickAndGoService.getOrder(order.id);
      if (res.success && res.data) setDetail(res.data);
    } catch (error) {
      console.error("Error loading order detail:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clientId || !restaurantId) {
        setLoading(false);
        return;
      }
      try {
        const res = await pickAndGoService.getUserOrders(clientId, {
          limit: HISTORY_LIMIT,
          restaurant_id: restaurantId,
        });
        if (!cancelled && res.success) setPast(res.data ?? []);
      } catch (error) {
        console.error("Error loading orders:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, restaurantId]);

  const activeIds = new Set(
    activeOrders.map((o) => o.pick_and_go_order?.id).filter(Boolean),
  );
  // Solo pedidos ya confirmados/pagados; los carritos abandonados no cuentan.
  const history = past.filter(
    (o) =>
      !activeIds.has(o.id) &&
      o.order_status !== "abandoned" &&
      o.order_status !== "active",
  );

  const reorderFromDetail = () => {
    const dishes = detail?.items?.filter((d) => d.menu_item_id) ?? [];
    if (dishes.length === 0) return;
    setDetail(null);
    onReorder(dishes);
  };

  const statusLabel = (status: string | undefined) =>
    status === "delivered"
      ? tc("statusDelivered")
      : status === "ready"
        ? tc("statusReady")
        : tc("statusPreparing");

  return (
    <div>
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        style={{
          animation: closing
            ? "fadeOut 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
            : "fade-in 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={t("title")}
        className="fixed inset-x-0 z-50 flex flex-col rounded-t-3xl overflow-hidden shadow-2xl border-t border-white/30"
        style={{
          top: "12%",
          bottom: 0,
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          animation: closing
            ? "slideDownModal 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
            : "slideUp 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-tone-300/80" />
        </div>
        <h2 className="px-6 md:px-8 pt-2 pb-3 text-2xl md:text-3xl font-medium text-black shrink-0">
          {t("title")}
        </h2>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 md:px-8 pb-8 space-y-6">
          {activeOrders.length > 0 && (
            <section>
              <h3 className="text-sm md:text-base font-medium text-tone-500 mb-2">
                {t("inProgress")}
              </h3>
              <div className="space-y-2">
                {activeOrders.map((order, index) => {
                  const o = order.pick_and_go_order;
                  return (
                    <button
                      key={o?.id ?? index}
                      type="button"
                      onClick={() => onOpenStatus(index)}
                      className="w-full text-left bg-even-evergreen text-white rounded-2xl p-4 active:scale-[0.98] transition-transform"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-lg">
                            {tc("orderNumber", { folio: o?.folio || "---" })}
                          </p>
                          <p className="text-sm text-white/70">
                            {statusLabel(o?.cooking_status)} · $
                            {Number(o?.total_amount ?? 0).toFixed(2)}
                          </p>
                        </div>
                        <span className="text-sm font-medium">{t("viewStatus")}</span>
                        <ChevronRight className="size-5 shrink-0" />
                      </div>
                      <div
                        role="progressbar"
                        aria-label={t("progressLabel")}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(orderProgress(order, now) * 100)}
                        className="mt-3 h-1.5 w-full rounded-full bg-white/15 overflow-hidden"
                      >
                        <div
                          className="h-full rounded-full bg-even-grass transition-[width] duration-700 ease-out"
                          style={{ width: `${orderProgress(order, now) * 100}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-sm md:text-base font-medium text-tone-500 mb-2">
              {t("previous")}
            </h3>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-8 animate-spin text-even-shamrock" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-tone-500">
                <ReceiptText className="size-8" strokeWidth={1.5} />
                <p className="text-base">{t("empty")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => openDetail(order)}
                    className="w-full text-left flex items-center gap-3 bg-white/70 border border-stroke rounded-2xl p-4 active:scale-[0.98] transition-transform"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base md:text-lg text-black">
                        {tc("orderNumber", { folio: order.folio || "---" })}
                      </p>
                      <p className="text-sm text-tone-500">
                        {formatDate(order.created_at)} · $
                        {Number(order.total_amount ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-tone-500" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {detail &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[1000] bg-black/30 backdrop-blur-xs animate-fade-in"
              onClick={() => setDetail(null)}
            />
            <div className="pointer-events-none fixed inset-0 z-[1001] flex items-center justify-center px-4 md:px-12 lg:px-28">
              <div
                role="dialog"
                aria-label={tc("orderNumber", { folio: detail.folio || "---" })}
                className="pointer-events-auto animate-slide-up flex w-full max-h-[80vh] flex-col overflow-hidden rounded-[32px] border border-white/60 bg-white/80 shadow-[0_8px_32px_0_rgba(0,0,0,0.25)] backdrop-blur-2xl"
              >
                <div className="flex items-start gap-3 px-6 md:px-8 pt-5 pb-3 shrink-0">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl md:text-2xl font-semibold text-black truncate">
                      {tc("orderNumber", { folio: detail.folio || "---" })}
                    </h2>
                    <p className="text-sm md:text-base text-tone-500">
                      {formatDate(detail.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="p-2 rounded-xl hover:bg-black/5 transition-colors"
                    aria-label="Cerrar"
                  >
                    <X className="size-6 text-black" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 md:px-8 pb-4">
                  {detailLoading && !detail.items?.length ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="size-8 animate-spin text-even-shamrock" />
                    </div>
                  ) : (
                    <div className="space-y-3 border-t border-black/10 pt-4">
                      {(detail.items ?? []).map((item) => (
                        <div key={item.id} className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-base md:text-lg text-black">
                              {item.quantity}x {item.item}
                            </p>
                            <ItemCustomizations
                              customFields={item.custom_fields as any}
                              className="mt-0.5"
                            />
                          </div>
                          <p className="font-medium text-base md:text-lg text-black">
                            $
                            {(
                              Number(item.price) * item.quantity +
                              Number(item.extra_price || 0)
                            ).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0 px-6 md:px-8 pt-3 pb-5 border-t border-black/10 space-y-3">
                  <div className="flex justify-between text-lg md:text-xl font-medium text-black">
                    <span>Total</span>
                    <span>${Number(detail.total_amount ?? 0).toFixed(2)} MXN</span>
                  </div>
                  <button
                    type="button"
                    onClick={reorderFromDetail}
                    disabled={!detail.items?.some((d) => d.menu_item_id)}
                    className="w-full flex items-center justify-center gap-2 py-3 md:py-4 rounded-full bg-even-grass text-even-evergreen font-medium text-base md:text-lg active:scale-95 transition-all disabled:opacity-60"
                  >
                    <RefreshCw className="size-5" />
                    {tc("reorderCta")}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

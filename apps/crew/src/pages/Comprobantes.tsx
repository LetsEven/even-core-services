import { useState } from "react";
import { Eye, X } from "lucide-react";
import { Badge, Button, Card, IconButton } from "@even/ui";
import { useAuth } from "@clerk/clerk-react";
import { useSession } from "../app/session/context";
import { useCaja } from "../features/caja/context";
import { formatDateTime } from "../features/caja/dateRange";
import { formatMoney, matchesQuery } from "../features/caja/summary";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Pestaña "Comprobantes" de Caja. Los comprobantes no traen el id de la orden,
// por eso no se enlazan al detalle de cada orden todavía.
export default function Comprobantes() {
  const { getToken } = useAuth();
  const { currentBranch } = useSession();
  const { vouchers, loading, vouchersError, refresh, query } = useCaja();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const visible = vouchers.filter((v) =>
    matchesQuery(query, v.locationLabel, v.service, v.paymentMethod),
  );

  const openPreview = async (voucherId: string) => {
    if (!currentBranch) return;
    setPreviewLoadingId(voucherId);
    setPreviewError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `${BASE_URL}/api/vouchers/${voucherId}/pdf?restaurantId=${currentBranch.restaurant_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPreviewUrl(URL.createObjectURL(await res.blob()));
    } catch {
      setPreviewError("No se pudo cargar el comprobante");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  if (loading && vouchers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-even-evergreen/15 border-t-even-grass rounded-full animate-spin" />
      </div>
    );
  }
  if (vouchersError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">Error al cargar comprobantes</p>
        <p className="text-sm text-even-evergreen/60">{vouchersError}</p>
        <Button size="sm" onClick={refresh}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-even-evergreen/50">
          {query
            ? "Ningún comprobante coincide con la búsqueda"
            : "No hay comprobantes en este período"}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="shrink-0 pb-2 text-xs text-even-evergreen/50">
        {visible.length} comprobante(s)
        {previewError && (
          <span className="text-danger"> · {previewError}</span>
        )}
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
        {visible.map((v) => (
          <Card
            key={v.id}
            padding="none"
            className="rounded-lg flex items-center gap-3 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="soft" size="sm">
                  {v.service}
                </Badge>
                {v.locationLabel && (
                  <span className="text-sm font-semibold truncate">
                    {v.locationLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-even-evergreen/55 truncate">
                {formatDateTime(v.created_at)} · {v.paymentMethod}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums shrink-0">
              {formatMoney(v.total_amount_charged)}
            </span>
            <IconButton
              aria-label="Ver comprobante"
              variant="ghost"
              disabled={previewLoadingId === v.id}
              onClick={() => openPreview(v.id)}
            >
              <Eye className="w-4 h-4" />
            </IconButton>
          </Card>
        ))}
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/60"
          onClick={closePreview}
        >
          <div
            className="flex-1 flex flex-col bg-even-offwhite m-2 rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-even-evergreen/10">
              <h2 className="text-sm font-medium uppercase tracking-wider">
                Comprobante
              </h2>
              <IconButton
                aria-label="Cerrar"
                variant="ghost"
                onClick={closePreview}
              >
                <X className="w-4 h-4" />
              </IconButton>
            </div>
            <iframe
              src={previewUrl}
              title="Comprobante"
              className="flex-1 w-full"
            />
          </div>
        </div>
      )}
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  RefreshCw,
  ChevronLeft,
  ChevronDown,
  Check,
  Eye,
  X,
} from "lucide-react";
import { getVouchers } from "../services/api";
import type { Branch, Voucher } from "../services/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

const SERVICE_COLORS: Record<string, string> = {
  "Flex Bill": "bg-even-grass/20 text-even-evergreen",
  "Tap Order & Pay": "bg-even-shamrock/20 text-even-evergreen",
  "Pick & Go": "bg-even-aqua/40 text-even-evergreen",
  "Room Service": "bg-even-evergreen/10 text-even-evergreen",
  "Tap & Pay": "bg-black/10 text-even-evergreen",
};

type Filter = "today" | "last7" | "last30";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "last7", label: "7 días" },
  { id: "last30", label: "30 días" },
];

function getDateRange(filter: Filter): { since: string; until: string } {
  const now = new Date();
  if (filter === "today") {
    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  if (filter === "last7") {
    const since = new Date(now);
    since.setDate(since.getDate() - 7);
    since.setHours(0, 0, 0, 0);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  const since = new Date(now);
  since.setDate(since.getDate() - 30);
  since.setHours(0, 0, 0, 0);
  return { since: since.toISOString(), until: now.toISOString() };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(amount);
}

interface Props {
  onBack: () => void;
  branches: Branch[];
  branchesLoading: boolean;
  branchId: string | null;
  onBranchChange: (id: string) => void;
}

export default function Comprobantes({
  onBack,
  branches,
  branchesLoading,
  branchId,
  onBranchChange,
}: Props) {
  const { getToken } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<Filter>("today");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(
    null,
  );
  const branchRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const currentBranch = branches.find((b) => b.id === branchId);

  const fetchVouchers = useCallback(
    async (filter: Filter = selectedFilter) => {
      if (!branchId || !currentBranch) return;
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) return;
        const { since, until } = getDateRange(filter);
        const result = await getVouchers(
          token,
          currentBranch.restaurant_id,
          branchId,
          since,
          until,
        );
        setVouchers(result.data);
      } catch (e: any) {
        setError(e.message ?? "Error al cargar comprobantes");
      } finally {
        setLoading(false);
      }
    },
    [getToken, branchId, currentBranch, selectedFilter],
  );

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setBranchOpen(false);
      }
    };
    if (branchOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [branchOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    if (filterOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterOpen]);

  const handleFilterChange = (f: Filter) => {
    setSelectedFilter(f);
    fetchVouchers(f);
  };

  const handleOpenPreview = async (voucherId: string) => {
    if (!currentBranch) return;
    setPreviewLoadingId(voucherId);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `${BASE_URL}/api/vouchers/${voucherId}/pdf?restaurantId=${currentBranch.restaurant_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setError("No se pudo cargar el comprobante");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const selectedLabel =
    FILTERS.find((f) => f.id === selectedFilter)?.label ?? "Hoy";

  return (
    <div
      className="relative min-h-screen flex flex-col"
      style={{ background: "#023828" }}
    >
      {/* Header */}
      <header className="px-5 pt-5 pb-2 flex items-center justify-between relative">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-even-offwhite/60 hover:text-even-offwhite hover:bg-white/10 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <img
          src="/even/even-asterisk-grass.svg"
          className="absolute left-1/2 -translate-x-1/2 w-8 h-8"
          alt="Even"
        />

        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchVouchers()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-even-offwhite/60 hover:text-even-offwhite hover:bg-white/10 transition-colors text-sm disabled:opacity-50 cursor-pointer disabled:cursor-default"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </header>

      {/* Título y selectores */}
      <div className="flex flex-col items-center pb-3 gap-1">
        <h1 className="text-even-offwhite font-medium text-xl uppercase tracking-widest">
          Comprobantes
        </h1>
        {!branchesLoading && branches.length > 0 && (
          <div className="relative" ref={branchRef}>
            <button
              onClick={() => setBranchOpen((v) => !v)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-even-offwhite/80 text-xs uppercase tracking-wider rounded-md px-4 py-1.5 border border-white/10 transition-colors cursor-pointer"
            >
              <span>{currentBranch?.name ?? "Seleccionar sucursal"}</span>
              {branches.length > 1 && (
                <ChevronDown
                  className={`w-3.5 h-3.5 text-even-offwhite/40 transition-transform ${branchOpen ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {branchOpen && branches.length > 1 && (
              <ul className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 min-w-full w-max bg-even-evergreen border border-white/10 rounded-lg overflow-hidden shadow-xl">
                {branches.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => {
                        onBranchChange(b.id);
                        setBranchOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-4 px-4 py-2.5 text-sm text-even-offwhite/80 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <span>{b.name}</span>
                      {b.id === branchId && (
                        <Check className="w-3.5 h-3.5 text-even-grass shrink-0" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {branchId && (
          <div className="relative pt-2" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-even-offwhite/80 text-xs uppercase tracking-wider rounded-md px-4 py-1.5 border border-white/10 transition-colors cursor-pointer"
            >
              <span>{selectedLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-even-offwhite/40 transition-transform ${filterOpen ? "rotate-180" : ""}`}
              />
            </button>
            {filterOpen && (
              <ul className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 min-w-full w-max bg-even-evergreen border border-white/10 rounded-lg overflow-hidden shadow-xl">
                {FILTERS.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => {
                        handleFilterChange(f.id);
                        setFilterOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-4 px-4 py-2.5 text-sm text-even-offwhite/80 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <span>{f.label}</span>
                      {f.id === selectedFilter && (
                        <Check className="w-3.5 h-3.5 text-even-grass shrink-0" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!loading && !error && branchId && (
          <p className="text-even-offwhite/50 text-sm pt-1">
            {vouchers.length} comprobante(s)
          </p>
        )}
      </div>

      {/* Panel de contenido */}
      <div
        className="flex-1 rounded-t-lg px-5 pt-6 pb-6 flex flex-col min-h-0 overflow-hidden text-even-evergreen"
        style={{ background: "#FEFEEB" }}
      >
        {branchesLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-even-evergreen/15 border-t-even-grass rounded-full animate-spin" />
          </div>
        ) : !branchId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-even-evergreen/70">
            <p className="font-medium text-even-evergreen">
              Selecciona una sucursal
            </p>
            <p className="text-sm text-center">
              Usa el selector de arriba para ver los comprobantes de la
              sucursal.
            </p>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-even-evergreen/15 border-t-even-grass rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-even-evergreen/70">
            <p className="font-medium text-even-evergreen">
              Error al cargar comprobantes
            </p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => fetchVouchers()}
              className="px-4 py-2 bg-even-grass text-even-evergreen rounded-md text-xs uppercase tracking-wider font-medium hover:bg-even-grass/90 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        ) : vouchers.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-even-evergreen/50 text-sm">
              No hay comprobantes en este período
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
            {vouchers.map((v) => (
              <div
                key={v.id}
                className="bg-white border border-even-evergreen/20 shadow-sm hover:shadow-md transition-shadow rounded-lg p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded uppercase tracking-wider ${
                        SERVICE_COLORS[v.service] ??
                        "bg-even-evergreen/10 text-even-evergreen"
                      }`}
                    >
                      {v.service}
                    </span>
                    {v.locationLabel && (
                      <span className="text-even-evergreen/60 text-xs">
                        {v.locationLabel}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleOpenPreview(v.id)}
                    disabled={previewLoadingId === v.id}
                    className="p-1.5 rounded-lg text-even-evergreen/50 hover:text-even-evergreen hover:bg-even-evergreen/10 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {previewLoadingId === v.id ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-even-evergreen/50">
                  <span>{formatDateTime(v.created_at)}</span>
                  <span className="text-even-evergreen font-semibold text-sm">
                    {formatCurrency(v.total_amount_charged)}
                  </span>
                </div>

                <p className="text-even-evergreen/70 text-xs">
                  {v.paymentMethod}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview del PDF — solo vista, sin descarga (ver nota en el plan) */}
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
              <h2 className="text-sm font-medium text-even-evergreen uppercase tracking-wider">
                Comprobante
              </h2>
              <button
                onClick={closePreview}
                className="p-1.5 text-even-evergreen/60 hover:bg-even-evergreen/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe src={previewUrl} title="Comprobante" className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

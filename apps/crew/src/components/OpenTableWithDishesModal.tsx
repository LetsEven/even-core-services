import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Minus,
  Plus,
  ChevronRight,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import type {
  Branch,
  MenuSection,
  MenuItem,
  MenuItemCustomField,
  BulkDishItem,
} from "../services/api";
import {
  getRestaurantMenu,
  addDishesToFlexBillBulk,
  updateOrderWaiter,
} from "../services/api";
import { getItemDisplayPrice } from "../utils/commissionCalculator";
import { minSelectionsOf, selectionHint } from "../utils/customFields";

// Flujo nuevo para Flex Bill: mesa libre → elegir varios platillos → armar
// carrito → confirmar. A diferencia de AddDishModal (que agrega UN platillo
// a una orden ya existente), acá todavía no existe orden — se junta un
// carrito y recién al confirmar se abre la mesa y se crea todo en una sola
// llamada (addDishesToFlexBillBulk → POST .../dishes/bulk, ver plan).

type CustomSelections = Record<
  string,
  string | string[] | Record<string, number>
>;

interface CartEntry {
  key: string;
  menuItem: MenuItem;
  quantity: number;
  customSelections: CustomSelections;
  specialInstructions: string;
}

interface Props {
  branch: Branch;
  tableNumber: string;
  requireWaiterLogin?: (
    onSuccess: (waiter: { id: string; name: string }) => void,
  ) => void;
  onClose: () => void;
  onSuccess: () => void;
}

function basePriceOf(menuItem: MenuItem): number {
  return menuItem.discount > 0
    ? menuItem.price * (1 - menuItem.discount / 100)
    : menuItem.price;
}

function extraPriceOf(
  menuItem: MenuItem,
  customSelections: CustomSelections,
): number {
  let extra = 0;
  for (const field of menuItem.custom_fields ?? []) {
    const sel = customSelections[field.id];
    if (
      field.type === "dropdown-quantity" &&
      sel &&
      typeof sel === "object" &&
      !Array.isArray(sel)
    ) {
      for (const [optId, qty] of Object.entries(
        sel as Record<string, number>,
      )) {
        const opt = field.options?.find((o) => o.id === optId);
        if (opt && qty > 0) extra += opt.price * qty;
      }
    } else if (Array.isArray(sel)) {
      for (const optId of sel) {
        const opt = field.options?.find((o) => o.id === optId);
        if (opt) extra += opt.price;
      }
    }
  }
  return extra;
}

// Precio que se le muestra al mesero (comisión de Flex Bill ya incrustada)
// — nunca se manda al backend, solo para pantalla.
// entryToBulkDishItem sigue usando basePriceOf/extraPriceOf (real).
function displayEntryTotal(entry: CartEntry): number {
  const unitPrice =
    basePriceOf(entry.menuItem) +
    extraPriceOf(entry.menuItem, entry.customSelections);
  return getItemDisplayPrice(unitPrice) * entry.quantity;
}

function entryToBulkDishItem(entry: CartEntry): BulkDishItem {
  const customFieldsData = (entry.menuItem.custom_fields ?? [])
    .map((field) => {
      const sel = entry.customSelections[field.id];
      let selectedOptions: Array<{
        optionId: string;
        optionName: string;
        price: number;
        quantity: number;
      }> = [];

      if (
        field.type === "dropdown-quantity" &&
        sel &&
        typeof sel === "object" &&
        !Array.isArray(sel)
      ) {
        selectedOptions = Object.entries(sel as Record<string, number>)
          .filter(([, q]) => q > 0)
          .map(([optId, q]) => {
            const opt = field.options?.find((o) => o.id === optId);
            return opt
              ? {
                  optionId: opt.id,
                  optionName: opt.name,
                  price: opt.price,
                  quantity: q,
                }
              : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
      } else if (Array.isArray(sel)) {
        selectedOptions =
          field.options
            ?.filter((o) => sel.includes(o.id))
            .map((o) => ({
              optionId: o.id,
              optionName: o.name,
              price: o.price,
              quantity: 1,
            })) ?? [];
      }

      return {
        fieldId: field.id,
        fieldName: field.name,
        fieldType: field.type,
        selectedOptions,
      };
    })
    .filter((f) => f.selectedOptions.length > 0);

  return {
    item: entry.menuItem.name,
    quantity: entry.quantity,
    price: basePriceOf(entry.menuItem),
    customFields: customFieldsData,
    extraPrice: extraPriceOf(entry.menuItem, entry.customSelections),
    menuItemId: entry.menuItem.id,
    specialInstructions: entry.specialInstructions.trim() || null,
    images: entry.menuItem.image_url ? [entry.menuItem.image_url] : [],
  };
}

export default function OpenTableWithDishesModal({
  branch,
  tableNumber,
  requireWaiterLogin = (onSuccess) => onSuccess({ id: "EVEN", name: "EVEN" }),
  onClose,
  onSuccess,
}: Props) {
  const { getToken } = useAuth();

  const [view, setView] = useState<"browse" | "customize" | "cart">("browse");
  const [sections, setSections] = useState<MenuSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customSelections, setCustomSelections] = useState<CustomSelections>(
    {},
  );
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const menu = await getRestaurantMenu(
          branch.restaurant_id,
          branch.branch_number,
          token,
        );
        if (cancelled) return;
        const activeSecs = menu.filter((s) => s.is_active);
        setSections(activeSecs);
        if (activeSecs.length > 0) setSelectedSection(activeSecs[0].id);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoadingMenu(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, branch.restaurant_id, branch.branch_number]);

  const visibleItems = useMemo(() => {
    const sec = sections.find((s) => s.id === selectedSection);
    return (sec?.items ?? []).filter(
      (i) => i.is_available && !i.is_out_of_stock,
    );
  }, [sections, selectedSection]);

  const displayTotalPrice = useMemo(() => {
    if (!selectedItem || quantity <= 0) return 0;
    const unitPrice =
      basePriceOf(selectedItem) + extraPriceOf(selectedItem, customSelections);
    return getItemDisplayPrice(unitPrice) * quantity;
  }, [selectedItem, customSelections, quantity]);

  const itemPriceMultiplier = useMemo(() => {
    if (!selectedItem) return 1;
    const unitPrice =
      basePriceOf(selectedItem) + extraPriceOf(selectedItem, customSelections);
    return unitPrice > 0 ? getItemDisplayPrice(unitPrice) / unitPrice : 1;
  }, [selectedItem, customSelections]);

  const isFormValid = useMemo(() => {
    if (!selectedItem) return false;
    for (const field of selectedItem.custom_fields ?? []) {
      const min = minSelectionsOf(field);
      if (min > 0) {
        const sel = customSelections[field.id] as string[] | undefined;
        if (!sel || sel.length < min) return false;
      }
    }
    return true;
  }, [selectedItem, customSelections]);

  const displayCartTotal = useMemo(
    () => cart.reduce((sum, e) => sum + displayEntryTotal(e), 0),
    [cart],
  );
  const cartCount = useMemo(
    () => cart.reduce((sum, e) => sum + e.quantity, 0),
    [cart],
  );

  function handleDropdownChange(fieldId: string, optionId: string) {
    setCustomSelections((prev) => {
      const current = (prev[fieldId] as string[] | undefined) ?? [];
      return {
        ...prev,
        [fieldId]: current.includes(optionId) ? [] : [optionId],
      };
    });
  }

  function handleCheckboxChange(
    fieldId: string,
    optionId: string,
    field: MenuItemCustomField,
  ) {
    setCustomSelections((prev) => {
      const current = (prev[fieldId] as string[]) ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [fieldId]: current.filter((i) => i !== optionId) };
      }
      const max = field.maxSelections ?? 1;
      if (current.length >= max) return prev;
      return { ...prev, [fieldId]: [...current, optionId] };
    });
  }

  function handleQuantityChange(
    fieldId: string,
    optionId: string,
    qty: number,
  ) {
    setCustomSelections((prev) => {
      const current = (prev[fieldId] as Record<string, number>) ?? {};
      const updated = { ...current };
      if (qty > 0) updated[optionId] = qty;
      else delete updated[optionId];
      return { ...prev, [fieldId]: updated };
    });
  }

  function selectItem(item: MenuItem) {
    setSelectedItem(item);
    setCustomSelections({});
    setSpecialInstructions("");
    setQuantity(1);
    setView("customize");
  }

  function addToCart() {
    if (!selectedItem || !isFormValid) return;
    setCart((prev) => [
      ...prev,
      {
        key: `${selectedItem.id}-${Date.now()}`,
        menuItem: selectedItem,
        quantity,
        customSelections,
        specialInstructions,
      },
    ]);
    setSelectedItem(null);
    setView("browse");
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((e) => e.key !== key));
  }

  function handleOpenTable() {
    if (cart.length === 0) return;
    // Abrir mesa requiere sesión de mesero en este dispositivo — si es
    // invitado, pide login (mesero + PIN) antes de confirmar.
    requireWaiterLogin((waiter) => submitOpenTable(waiter));
  }

  async function submitOpenTable(waiter: { id: string; name: string }) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No token");

      const result = await addDishesToFlexBillBulk(
        {
          restaurantId: branch.restaurant_id,
          branchNumber: branch.branch_number,
          tableNumber,
          guestName:
            waiter.id === "EVEN" ? "MESERO" : `MESERO - ${waiter.name}`,
          items: cart.map(entryToBulkDishItem),
        },
        token,
      );

      // La mesa nace asignada al mesero de la sesión (si hay uno real) —
      // mismo endpoint que usa OrderCard para reclamar/deshacer.
      if (waiter.id !== "EVEN" && result.table_order_id) {
        try {
          await updateOrderWaiter(
            result.table_order_id,
            "flex_bill",
            waiter.name,
            waiter.id,
            token,
          );
        } catch {
          // No bloquear la apertura de la mesa si esto falla — se puede
          // reclamar después desde OrderCard.
        }
      }

      onSuccess();
    } catch {
      setSubmitError("No se pudo abrir la mesa. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    view === "browse"
      ? "Agregar platillo"
      : view === "customize"
        ? (selectedItem?.name ?? "Personalizar")
        : "Carrito";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-t-lg sm:rounded-lg overflow-hidden flex flex-col border border-white/10 shadow-2xl"
        style={{ background: "#023828", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8 shrink-0"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div>
            <p className="text-even-offwhite/40 text-xs uppercase tracking-widest mb-0.5">
              Mesa {tableNumber}
            </p>
            <div className="flex items-center gap-2">
              {view === "customize" && (
                <button
                  onClick={() => setView("browse")}
                  className="text-even-offwhite/40 hover:text-even-offwhite transition-colors text-sm cursor-pointer"
                >
                  ←
                </button>
              )}
              <h2 className="text-even-offwhite font-bold text-xl leading-none">
                {title}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-even-offwhite/30 hover:text-even-offwhite hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View: browse */}
        {view === "browse" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex gap-2 px-5 py-3 overflow-x-auto shrink-0 no-scrollbar">
              {loadingMenu ? (
                <div className="h-7 w-24 rounded bg-white/10 animate-pulse" />
              ) : (
                sections.map((sec) => (
                  <button
                    key={sec.id}
                    onClick={() => setSelectedSection(sec.id)}
                    className={`shrink-0 text-[0.6875rem] px-3 py-1 rounded font-medium uppercase tracking-wider transition-colors cursor-pointer border ${
                      selectedSection === sec.id
                        ? "bg-even-grass border-even-grass text-even-evergreen"
                        : "bg-white/5 border-white/10 text-even-offwhite/50 hover:bg-white/10 hover:text-even-offwhite/70"
                    }`}
                  >
                    {sec.name}
                  </button>
                ))
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 flex flex-col gap-2">
              {loadingMenu ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg bg-white/5 animate-pulse"
                  />
                ))
              ) : visibleItems.length === 0 ? (
                <p className="text-even-offwhite/30 text-sm text-center mt-8">
                  Sin platillos en esta sección
                </p>
              ) : (
                <div
                  className="rounded-lg border border-white/8 overflow-y-auto no-scrollbar"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  {visibleItems.map((item, idx) => (
                    <button
                      key={item.id}
                      onClick={() => selectItem(item)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors cursor-pointer text-left ${
                        idx > 0 ? "border-t border-white/8" : ""
                      }`}
                    >
                      <p className="text-sm text-even-offwhite/80">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm text-even-offwhite/40">
                          ${getItemDisplayPrice(basePriceOf(item)).toFixed(2)}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-even-offwhite/20" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Barra de carrito */}
            {cart.length > 0 && (
              <div className="px-5 pb-5 pt-2 border-t border-white/8 shrink-0">
                <button
                  onClick={() => setView("cart")}
                  className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-lg bg-even-grass hover:bg-even-grass/90 text-even-evergreen transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider">
                    <ShoppingBag className="w-4 h-4" />
                    {cartCount} {cartCount === 1 ? "platillo" : "platillos"}
                  </span>
                  <span className="text-sm font-bold">
                    ${displayCartTotal.toFixed(2)}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* View: customize (mismo comportamiento que AddDishModal, pero agrega al carrito) */}
        {view === "customize" && selectedItem && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4">
              <div
                className="rounded-lg border border-white/8 px-4 py-3 flex items-center justify-between shrink-0"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <span className="text-sm text-even-offwhite/60">Cantidad</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded-md border border-white/15 text-even-offwhite/60 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-base font-semibold text-even-offwhite w-5 text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-md border border-white/15 text-even-offwhite/60 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(selectedItem.custom_fields ?? []).map((field) => (
                <div
                  key={field.id}
                  className="rounded-lg border border-white/8 overflow-hidden shrink-0"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest text-even-offwhite/60 font-medium">
                      {field.name}
                    </span>
                    {minSelectionsOf(field) > 0 && (
                        <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/25 text-amber-300 uppercase tracking-wider">
                          Requerido
                        </span>
                      )}
                    {field.type === "checkboxes" && (
                      <span className="text-[0.625rem] text-even-offwhite/30">
                        {selectionHint(field)}
                      </span>
                    )}
                  </div>

                  {field.type === "dropdown" && field.options && (
                    <>
                      {field.options.map((opt) => {
                        const sel =
                          (customSelections[field.id] as
                            | string[]
                            | undefined) ?? [];
                        const isSelected = sel.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            onClick={() =>
                              !opt.agotado &&
                              handleDropdownChange(field.id, opt.id)
                            }
                            disabled={opt.agotado}
                            className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors border-t border-white/8 disabled:cursor-default disabled:opacity-40 ${
                              opt.agotado
                                ? ""
                                : isSelected
                                  ? "bg-even-grass/15 cursor-pointer"
                                  : "hover:bg-white/5 cursor-pointer"
                            }`}
                          >
                            <div>
                              <span
                                className={`text-sm ${isSelected ? "text-even-offwhite" : "text-even-offwhite/70"}`}
                              >
                                {opt.name}
                              </span>
                              {opt.agotado ? (
                                <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-red-500/15 border border-red-400/25 text-red-300 uppercase tracking-wider ml-2">
                                  Agotado
                                </span>
                              ) : (
                                opt.price > 0 && (
                                  <span className="text-xs text-even-grass ml-2">
                                    +$
                                    {(opt.price * itemPriceMultiplier).toFixed(
                                      2,
                                    )}
                                  </span>
                                )
                              )}
                            </div>
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "border-even-grass"
                                  : "border-white/20"
                              }`}
                            >
                              {isSelected && (
                                <div className="w-2 h-2 rounded-full bg-even-grass" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {field.type === "checkboxes" && field.options && (
                    <>
                      {field.options.map((opt) => {
                        const sel =
                          (customSelections[field.id] as string[]) ?? [];
                        const isSelected = sel.includes(opt.id);
                        const isDisabled =
                          opt.agotado ||
                          (!isSelected &&
                            sel.length >= (field.maxSelections ?? 1));
                        return (
                          <button
                            key={opt.id}
                            onClick={() =>
                              !isDisabled &&
                              handleCheckboxChange(field.id, opt.id, field)
                            }
                            disabled={isDisabled}
                            className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40 border-t border-white/8 ${
                              isSelected
                                ? "bg-even-grass/15"
                                : "hover:bg-white/5"
                            }`}
                          >
                            <div>
                              <span
                                className={`text-sm ${isSelected ? "text-even-offwhite" : "text-even-offwhite/70"}`}
                              >
                                {opt.name}
                              </span>
                              {opt.agotado ? (
                                <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-red-500/15 border border-red-400/25 text-red-300 uppercase tracking-wider ml-2">
                                  Agotado
                                </span>
                              ) : (
                                opt.price > 0 && (
                                  <span className="text-xs text-even-grass ml-2">
                                    +$
                                    {(opt.price * itemPriceMultiplier).toFixed(
                                      2,
                                    )}
                                  </span>
                                )
                              )}
                            </div>
                            <div
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? "border-even-grass bg-even-grass"
                                  : "border-white/20"
                              }`}
                            >
                              {isSelected && (
                                <svg
                                  className="w-2.5 h-2.5 text-even-offwhite"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={3}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {field.type === "dropdown-quantity" && field.options && (
                    <>
                      {field.options.map((opt) => {
                        const sel = customSelections[field.id];
                        const qty =
                          sel && typeof sel === "object" && !Array.isArray(sel)
                            ? ((sel as Record<string, number>)[opt.id] ?? 0)
                            : 0;
                        return (
                          <div
                            key={opt.id}
                            className={`flex items-center justify-between px-4 py-3 border-t border-white/8 ${
                              opt.agotado ? "opacity-40" : ""
                            }`}
                          >
                            <div>
                              <span className="text-sm text-even-offwhite/70">
                                {opt.name}
                              </span>
                              {opt.agotado ? (
                                <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-red-500/15 border border-red-400/25 text-red-300 uppercase tracking-wider ml-2">
                                  Agotado
                                </span>
                              ) : (
                                opt.price > 0 && (
                                  <span className="text-xs text-even-grass ml-2">
                                    +$
                                    {(opt.price * itemPriceMultiplier).toFixed(
                                      2,
                                    )}
                                  </span>
                                )
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() =>
                                  handleQuantityChange(
                                    field.id,
                                    opt.id,
                                    Math.max(0, qty - 1),
                                  )
                                }
                                disabled={qty <= 0 || opt.agotado}
                                className="w-7 h-7 flex items-center justify-center rounded-md border border-white/15 text-even-offwhite/50 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-sm font-medium text-even-offwhite w-4 text-center">
                                {qty}
                              </span>
                              <button
                                onClick={() =>
                                  !opt.agotado &&
                                  handleQuantityChange(
                                    field.id,
                                    opt.id,
                                    qty + 1,
                                  )
                                }
                                disabled={opt.agotado}
                                className="w-7 h-7 flex items-center justify-center rounded-md border border-white/15 text-even-offwhite/50 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              ))}

              <div className="flex flex-col gap-1.5 shrink-0">
                <label className="text-xs uppercase tracking-widest text-even-offwhite/60 font-medium">
                  Instrucciones especiales
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  maxLength={60}
                  placeholder="Alergias, sin sal, bien cocido..."
                  rows={2}
                  className="w-full rounded-lg border border-white/8 px-4 py-3 text-sm text-even-offwhite/80 placeholder-white/20 resize-none focus:outline-none focus:border-white/20"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                />
                <p className="text-right text-[0.625rem] text-even-offwhite/20">
                  {specialInstructions.length}/60
                </p>
              </div>
            </div>

            <div className="px-5 pb-6 pt-3 border-t border-white/8 shrink-0">
              <button
                onClick={addToCart}
                disabled={!isFormValid}
                className="w-full py-3 rounded-lg bg-even-grass hover:bg-even-grass/90 text-even-evergreen text-xs font-medium uppercase tracking-wider transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40"
              >
                Agregar al carrito · ${displayTotalPrice.toFixed(2)}
              </button>
            </div>
          </div>
        )}

        {/* View: cart — revisar y confirmar apertura de mesa */}
        {view === "cart" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-3">
              {cart.length === 0 ? (
                <p className="text-even-offwhite/30 text-sm text-center mt-8">
                  Carrito vacío
                </p>
              ) : (
                cart.map((entry) => (
                  <div
                    key={entry.key}
                    className="rounded-lg border border-white/8 px-4 py-3 flex items-center justify-between gap-3"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-even-offwhite/80 truncate">
                        {entry.quantity}× {entry.menuItem.name}
                      </p>
                      <p className="text-xs text-even-offwhite/40">
                        ${displayEntryTotal(entry).toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromCart(entry.key)}
                      className="shrink-0 p-2 rounded-md text-even-offwhite/30 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}

              {submitError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-400/20 rounded-lg px-4 py-3 text-center">
                  {submitError}
                </p>
              )}
            </div>

            <div className="px-5 pb-6 pt-3 border-t border-white/8 shrink-0 flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-even-offwhite/60">Total</span>
                <span className="text-even-offwhite font-bold text-lg">
                  ${displayCartTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setView("browse")}
                  className="px-5 py-3 rounded-md border border-white/15 text-even-offwhite/60 text-xs font-medium uppercase tracking-wider hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Agregar más
                </button>
                <button
                  onClick={handleOpenTable}
                  disabled={submitting || cart.length === 0}
                  className="flex-1 py-3 rounded-lg bg-even-grass hover:bg-even-grass/90 text-even-evergreen text-xs font-medium uppercase tracking-wider transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40"
                >
                  {submitting ? "Abriendo mesa..." : "Abrir mesa"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

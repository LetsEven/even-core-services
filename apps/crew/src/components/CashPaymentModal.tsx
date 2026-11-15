import { useState, useEffect } from "react";
import { Button, Input, Modal } from "@even/ui";
import { useAuth } from "../lib/auth";
import {
  Banknote,
  CreditCard,
  ChevronRight,
  Check,
  Loader2,
} from "lucide-react";
import type {
  Order,
  ManualPaymentMethod,
  ManualPaymentType,
  ManualCardType,
  TableSummary,
  DishOrderCrew,
} from "../types";
import type { Branch } from "../services/api";
import {
  getTableSummary,
  getDishOrders,
  payTableManual,
  payDishOrderManual,
  payTapPayOrderAmount,
  payTapPayDishOrder,
  createManualTransaction,
} from "../services/api";
import {
  calculateCommissions,
  calculateFlexBillItemCommission,
  calculateFlexBillProportionalCommission,
  resolveTipAmountForTargetDisplay,
  getDisplaySubtotal,
  getDisplaySubtotalForFraction,
  type FlexBillCommissionLineItem,
  type CommissionBreakdown,
} from "../utils/commissionCalculator";
import { parseLocationCode } from "../utils/identifier";

interface Props {
  order: Order;
  branch: Branch;
  waiterSession?: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

const TIP_OPTIONS = [0, 10, 15, 20] as const;

// Steps: 0=tipo de cobro, 1=propina, 2=método+confirmación
const STEP_LABELS = ["Tipo de cobro", "Propina", "Confirmar"];

export default function CashPaymentModal({
  order,
  branch,
  waiterSession = null,
  onClose,
  onSuccess,
}: Props) {
  const { getToken } = useAuth();

  const [step, setStep] = useState(0);

  // Step 0 — tipo de cobro
  const [payType, setPayType] = useState<ManualPaymentType | null>(null);
  const [tableSummary, setTableSummary] = useState<TableSummary | null>(null);
  const [dishOrders, setDishOrders] = useState<DishOrderCrew[]>([]);
  const [selectedDishes, setSelectedDishes] = useState<Set<string>>(new Set());
  const [customAmount, setCustomAmount] = useState("");
  const [loadingData, setLoadingData] = useState(false);

  // Step 1 — propina
  const [tipPct, setTipPct] = useState<number>(0);
  const [customTip, setCustomTip] = useState("");
  const [showCustomTip, setShowCustomTip] = useState(false);

  // Step 2 — método + confirmación
  const [method, setMethod] = useState<ManualPaymentMethod>("cash");
  const [manualCardType, setManualCardType] = useState<ManualCardType | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isTapPay = order.orderType === "tap_pay";
  const tableNumber = parseLocationCode(order.identifier);
  const cobradoPor = waiterSession
    ? `MESERO - ${waiterSession.name}`
    : "MESERO";

  // Load table summary + dish orders when step 0 opens (flex_bill only) —
  // los dish_order reales se necesitan desde el arranque, no solo para
  // "select-items", porque ahora el cálculo de comisión por ítem también
  // los usa en "full-bill"/"choose-amount" (franja por precio de cada
  // platillo, no por el subtotal de la mesa).
  useEffect(() => {
    if (isTapPay) return;
    if (step === 0 && tableNumber != null && !tableSummary) {
      setLoadingData(true);
      getToken().then(async (token) => {
        if (!token) return;
        try {
          const [summary, dishes] = await Promise.all([
            getTableSummary(
              String(branch.restaurant_id),
              String(branch.branch_number),
              String(tableNumber),
              token,
            ),
            getDishOrders(
              String(branch.restaurant_id),
              String(branch.branch_number),
              String(tableNumber),
              token,
            ),
          ]);
          setTableSummary(summary);
          setDishOrders(dishes.filter((d) => d.payment_status === "not_paid"));
        } catch (e: any) {
          console.error("Error loading table data:", e.message);
        } finally {
          setLoadingData(false);
        }
      });
    }
  }, [step]);

  // Tap Pay: la lista de platillos ya viene sincrónica en order.dishes — se
  // arma solo cuando se elige "select-items", igual que antes (Tap Pay no
  // se toca, sigue con el modelo de comisión viejo).
  useEffect(() => {
    if (!isTapPay || payType !== "select-items" || dishOrders.length > 0)
      return;
    const unpaid = order.dishes
      .filter((d) => d.paymentStatus !== "paid")
      .map((d) => ({
        dish_order_id: d.id,
        item: d.item,
        quantity: d.quantity,
        price: d.price ?? 0,
        total_price: (d.price ?? 0) * d.quantity,
        payment_status: "not_paid" as const,
        guest_name: "",
      }));
    setDishOrders(unpaid);
  }, [payType]);

  // Derived amounts
  const remaining =
    tableSummary?.remaining_amount ?? order.remainingAmount ?? 0;

  // Un pago genérico previo (choose-amount/"Dividir cuenta"/full-bill
  // parcial) no marca ningún dish_order como paid — solo se resta de
  // table_order.remaining_amount — así que `dishOrders` (los "not_paid")
  // sigue trayendo TODOS los platillos como si nada se hubiera pagado.
  // rawUnpaidTotal/remainingFraction escalan el consumo real pendiente a
  // lo que de verdad falta, igual que hace el backend en
  // computeFlexBillAmountDue (unpaidDishesTotal - genericPaid).
  const rawUnpaidTotal = dishOrders.reduce(
    (sum, d) => sum + (d.total_price ?? 0),
    0,
  );
  const remainingFraction =
    !isTapPay && rawUnpaidTotal > 0
      ? Math.min(Math.max(remaining / rawUnpaidTotal, 0), 1)
      : 1;

  // Precio con la comisión de Flex Bill ya incrustada (viene del backend en
  // dish_order.total_display_price) — solo aplica a la rama no-Tap-Pay.
  // Tap Pay sigue con el modelo viejo y usa `remaining` real tal cual.
  const displayRemaining = isTapPay
    ? remaining
    : Math.round(
        dishOrders.reduce(
          (sum, d) => sum + (d.total_display_price ?? d.total_price ?? 0),
          0,
        ) *
          remainingFraction *
          100,
      ) / 100;

  function toCommissionLineItem(d: DishOrderCrew): FlexBillCommissionLineItem {
    // DishOrderCrew no trae extra_price aparte — total_price ya incluye
    // cantidad × (price + extras), así que se reconstruye el precio
    // unitario combinado desde ahí para no perder la franja correcta.
    const unitPrice = d.quantity > 0 ? d.total_price / d.quantity : d.price;
    return { price: unitPrice, quantity: d.quantity };
  }

  function getBaseAmount(): number {
    if (payType === "full-bill") return remaining;
    if (payType === "select-items") {
      return dishOrders
        .filter((d) => selectedDishes.has(d.dish_order_id))
        .reduce((sum, d) => sum + d.total_price, 0);
    }
    if (payType === "choose-amount") {
      const typed = parseFloat(customAmount) || 0;
      if (isTapPay) return typed;
      // El monto que escribe el mesero está en "espacio inflado" (lo que
      // ve como "Restante" en pantalla) — se convierte a la porción real
      // equivalente, que es lo que el resto del cálculo necesita.
      if (!typed || displayRemaining <= 0) return 0;
      return (typed / displayRemaining) * remaining;
    }
    return 0;
  }

  // Modelo viejo (% o monto libre directo sobre el consumo real) — sigue
  // siendo la fuente de la propina para Tap Pay tal cual, sin cambios.
  function getRawTipAmount(): number {
    const base = getBaseAmount();
    if (showCustomTip) return parseFloat(customTip) || 0;
    return parseFloat(((base * tipPct) / 100).toFixed(2));
  }

  const baseAmount = getBaseAmount();

  // Ítems reales de "select-items" (subset elegido) y de la mesa completa
  // (full-bill/choose-amount usan todos los pendientes) — se reutilizan
  // para el cálculo de comisión y para el subtotal redondeado por ítem.
  const selectedCommissionItems = dishOrders
    .filter((d) => selectedDishes.has(d.dish_order_id))
    .map(toCommissionLineItem);
  const allTableCommissionItems = dishOrders.map(toCommissionLineItem);

  // Fracción de la mesa que representa este cobro — 1 para select-items (se
  // conocen los ítems exactos); para full-bill es remainingFraction (lo que
  // de verdad falta, ya descontando pagos genéricos previos); para
  // choose-amount es la porción del total real pendiente que representa el
  // monto tecleado.
  const paymentFraction = (() => {
    if (isTapPay || payType === "select-items") return 1;
    if (payType === "full-bill") return remainingFraction;
    const { baseAmount: realBase } = calculateFlexBillItemCommission(
      allTableCommissionItems,
      0,
    );
    return realBase > 0 ? Math.min(Math.max(baseAmount / realBase, 0), 1) : 0;
  })();

  // Arma el breakdown real de comisión para una propina dada, según el
  // tipo de cobro — se reutiliza para resolver la propina real y para el
  // breakdown final.
  function computeCommissionsForTip(tip: number): CommissionBreakdown {
    if (isTapPay) return calculateCommissions(baseAmount, tip);
    if (payType === "select-items") {
      return calculateFlexBillItemCommission(selectedCommissionItems, tip);
    }
    // full-bill y choose-amount: fracción del total real pendiente de la
    // mesa (ya descuenta pagos genéricos previos vía paymentFraction).
    return calculateFlexBillProportionalCommission(
      allTableCommissionItems,
      paymentFraction,
      tip,
    );
  }

  // Subtotal fijo — para Tap Pay sigue siendo el consumo real solo (modelo
  // viejo, sin cambios); para Flex Bill es consumo + su propia comisión,
  // redondeado por ítem (mismo método que OrderCard/kitchenService.js), así
  // que no se mueve con la propina ni difiere en un centavo de lo que ya
  // se ve en la tarjeta de la orden.
  const displaySubtotal = isTapPay
    ? baseAmount
    : payType === "select-items"
      ? getDisplaySubtotal(selectedCommissionItems)
      : getDisplaySubtotalForFraction(allTableCommissionItems, paymentFraction);

  // Propina real que hay que mandar al cálculo — para Tap Pay es la de
  // siempre; para Flex Bill se resuelve hacia atrás para que el residuo
  // (Total - Subtotal fijo) cierre exacto contra lo que el mesero eligió
  // ver (% del subtotal fijo, o el monto libre tecleado tal cual).
  const tipAmount = isTapPay
    ? getRawTipAmount()
    : resolveTipAmountForTargetDisplay(
        computeCommissionsForTip,
        displaySubtotal,
        showCustomTip
          ? parseFloat(customTip) || 0
          : Math.round(((displaySubtotal * tipPct) / 100) * 100) / 100,
      );

  // Sin propina, Total debe ser exactamente el Subtotal fijo — pero
  // computeCommissionsForTip(0) puede diferir de displaySubtotal por un
  // centavo: usa una tasa combinada sobre el crudo sin redondear y redondea
  // una sola vez al final, mientras displaySubtotal redondea por ítem (ver
  // comentario arriba de getDisplaySubtotal). Se corrige aquí ajustando
  // evenClientCharge por esa misma diferencia, para que
  // baseAmount + tipAmount + evenClientCharge siga sumando exacto contra
  // totalAmountCharged (el backend valida esa consistencia al insertar el pago).
  const rawCommissions = computeCommissionsForTip(tipAmount);
  const commissions =
    !isTapPay && tipAmount === 0 && rawCommissions.totalAmountCharged !== displaySubtotal
      ? {
          ...rawCommissions,
          evenClientCharge:
            Math.round(
              (rawCommissions.evenClientCharge -
                (rawCommissions.totalAmountCharged - displaySubtotal)) *
                100,
            ) / 100,
          totalAmountCharged: displaySubtotal,
        }
      : rawCommissions;
  const totalAmount = commissions.totalAmountCharged;

  // Lo que se muestra como "Propina" — para Tap Pay es tal cual (modelo
  // viejo); para Flex Bill es el residuo real (Total - Subtotal fijo), que
  // por construcción coincide con lo que el mesero eligió ver.
  const displayPropina = isTapPay
    ? tipAmount
    : Math.round((totalAmount - displaySubtotal) * 100) / 100;

  // El backend rechaza (500) si el monto base supera el restante. Lo evitamos
  // aquí solo para "Elegir monto", que es entrada libre (las demás opciones
  // nunca exceden el restante). Comparado en el mismo espacio que ve el
  // mesero: real para Tap Pay, inflado para Flex Bill.
  const overpaying =
    payType === "choose-amount" &&
    parseFloat(customAmount || "0") >
      (isTapPay ? remaining : displayRemaining) + 0.001;

  function canProceedStep0() {
    if (!payType) return false;
    if (payType === "select-items") return selectedDishes.size > 0;
    if (payType === "choose-amount")
      return parseFloat(customAmount) > 0 && !overpaying;
    return baseAmount > 0;
  }

  function canConfirm() {
    if (totalAmount <= 0) return false;
    if (overpaying) return false;
    if (method === "terminal") return manualCardType !== null;
    return true;
  }

  async function handleConfirm() {
    if (tableNumber == null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No autenticado");

      const txParams = {
        ...(isTapPay
          ? { id_tap_pay_order: order.id }
          : { id_table_order: order.id }),
        restaurant_id: branch.restaurant_id,
        // Para que el backend recalcule la comisión desde los ítems reales
        // exactos en vez de caer siempre a la rama proporcional — ver
        // recomputeFlexBillCommission en paymentController.js.
        ...(!isTapPay && payType ? { payment_type: payType } : {}),
        ...(!isTapPay && payType === "select-items"
          ? { selected_item_ids: Array.from(selectedDishes) }
          : {}),
        base_amount: baseAmount,
        tip_amount: tipAmount,
        iva_tip: commissions.ivaTip,
        total_amount_charged: totalAmount,
        subtotal_for_commission: commissions.subtotalForCommission,
        even_commission_total: commissions.evenCommissionTotal,
        even_commission_client: commissions.evenCommissionClient,
        even_commission_restaurant: commissions.evenCommissionRestaurant,
        iva_even_client: commissions.ivaEvenClient,
        iva_even_restaurant: commissions.ivaEvenRestaurant,
        even_client_charge: commissions.evenClientCharge,
        even_restaurant_charge: commissions.evenRestaurantCharge,
        even_rate_applied: commissions.even_rate_applied,
        transaction_by: cobradoPor,
        payment_source: method,
        manual_reference: null,
        manual_card_type: method === "terminal" ? manualCardType : null,
      };

      if (isTapPay) {
        // Tap-pay: primero se aplica el pago y solo si tiene éxito se registra
        // la transacción, para no dejar movimientos huérfanos en el ledger si
        // el pago falla. (Este flujo no manda payment_type, así que el backend
        // no recalcula la comisión contra lo pendiente.)
        if (payType === "select-items") {
          const dishArray = Array.from(selectedDishes);
          for (let i = 0; i < dishArray.length; i++) {
            const isLast = i === dishArray.length - 1;
            await payTapPayDishOrder(
              dishArray[i],
              cobradoPor,
              token,
              isLast ? tipAmount : 0,
              method,
            );
          }
        } else {
          await payTapPayOrderAmount(
            order.id,
            baseAmount,
            cobradoPor,
            token,
            tipAmount,
            method,
          );
        }
        try {
          await createManualTransaction(txParams, token);
        } catch (e: any) {
          throw new Error(
            "El pago se aplicó pero no se pudo registrar el movimiento: " +
              (e.message ?? "error desconocido"),
          );
        }
        onSuccess();
        return;
      }

      // Mesas (Flex Bill): createManualTransaction va ANTES de aplicar el pago
      // a propósito: el backend recalcula la comisión server-side comparando
      // contra lo que sigue "sin pagar" en ese momento (ver
      // recomputeFlexBillCommission → computeFlexBillAmountDue). Si el pago ya
      // se aplicó, esa comparación da 0 y truena con "base_amount debe ser
      // mayor a 0".
      await createManualTransaction(txParams, token);

      if (payType === "select-items") {
        for (const dishId of selectedDishes) {
          await payDishOrderManual(
            dishId,
            cobradoPor,
            token,
            String(branch.restaurant_id),
            String(branch.branch_number),
            String(tableNumber),
          );
        }
      } else {
        await payTableManual(
          {
            restaurantId: String(branch.restaurant_id),
            branchNumber: String(branch.branch_number),
            tableNumber: String(tableNumber),
            amount: baseAmount,
            guestName: cobradoPor,
          },
          token,
        );
      }

      onSuccess();
    } catch (e: any) {
      setSubmitError(e.message ?? "Error al registrar el pago");
    } finally {
      setSubmitting(false);
    }
  }

  const cardClass = "rounded-lg border border-stroke-soft px-4 py-4";
  const optionClass = (active: boolean) =>
    active
      ? "border-even-evergreen bg-even-grass/20 text-even-evergreen"
      : "border-stroke-soft text-tone-600 hover:bg-black/5";
  const sectionLabel =
    "text-xs font-medium uppercase tracking-widest text-tone-600";

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar pago"
      description={`${order.identifier} · ${STEP_LABELS[step]} · ${step + 1}/${STEP_LABELS.length}`}
      footer={
        <div className="flex gap-3">
          {step > 0 && (
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setStep((s) => s - 1)}
            >
              Atrás
            </Button>
          )}

          {step < 2 ? (
            <Button
              fullWidth
              disabled={step === 0 && !canProceedStep0()}
              onClick={() => setStep((s) => s + 1)}
            >
              Continuar
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button
              fullWidth
              loading={submitting}
              disabled={!canConfirm()}
              onClick={handleConfirm}
            >
              {!submitting && <Check className="size-4" />}
              {submitting ? "Registrando..." : "Confirmar pago"}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
          {/* ── Step 0: Tipo de cobro ── */}
          {step === 0 && (
            <>
              {loadingData && !tableSummary ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-6 animate-spin text-tone-500" />
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-lg border border-stroke-soft">
                    {(
                      [
                        {
                          type: "full-bill",
                          label: "Cuenta restante",
                          desc: `$${displayRemaining.toFixed(2)}`,
                        },
                        {
                          type: "select-items",
                          label: "Seleccionar platillos",
                          desc: "Elige items específicos",
                        },
                        {
                          type: "choose-amount",
                          label: "Elegir monto",
                          desc: "Monto libre",
                        },
                      ] as {
                        type: ManualPaymentType;
                        label: string;
                        desc: string;
                      }[]
                    ).map(({ type, label, desc }, idx) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setPayType(type)}
                        className={`flex min-h-11 w-full cursor-pointer items-center justify-between px-4 py-3.5 text-left transition-colors ${
                          idx > 0 ? "border-t border-stroke-soft" : ""
                        } ${payType === type ? "bg-even-grass/20" : "hover:bg-black/5"}`}
                      >
                        <div>
                          <p
                            className={`text-sm font-medium ${payType === type ? "text-even-evergreen" : "text-tone-700"}`}
                          >
                            {label}
                          </p>
                          <p className="mt-0.5 text-xs text-tone-500">{desc}</p>
                        </div>
                        {payType === type && (
                          <Check className="size-4 shrink-0 text-even-evergreen" />
                        )}
                      </button>
                    ))}
                  </div>

                  {payType === "select-items" && (
                    <div className="flex flex-col gap-2">
                      {loadingData ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="size-5 animate-spin text-tone-500" />
                        </div>
                      ) : dishOrders.length === 0 ? (
                        <p className="py-3 text-center text-sm text-tone-500">
                          Sin platillos pendientes
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-stroke-soft">
                          {dishOrders.map((dish, idx) => (
                            <button
                              key={dish.dish_order_id}
                              type="button"
                              onClick={() =>
                                setSelectedDishes((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(dish.dish_order_id))
                                    next.delete(dish.dish_order_id);
                                  else next.add(dish.dish_order_id);
                                  return next;
                                })
                              }
                              className={`flex min-h-11 w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors ${
                                idx > 0 ? "border-t border-stroke-soft" : ""
                              } ${selectedDishes.has(dish.dish_order_id) ? "bg-even-grass/20" : "hover:bg-black/5"}`}
                            >
                              <span
                                className={`text-sm ${selectedDishes.has(dish.dish_order_id) ? "font-medium text-black" : "text-tone-700"}`}
                              >
                                {dish.quantity}× {dish.item}
                              </span>
                              <span className="ml-2 shrink-0 text-sm font-medium text-even-evergreen">
                                $
                                {(
                                  dish.total_display_price ?? dish.total_price
                                ).toFixed(2)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {payType === "choose-amount" && (
                    <Input
                      label="Monto a cobrar"
                      type="number"
                      min="0"
                      step="0.01"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="0.00"
                      error={
                        overpaying
                          ? `El monto excede el restante ($${(isTapPay ? remaining : displayRemaining).toFixed(2)}).`
                          : undefined
                      }
                      hint={`Restante: $${(isTapPay ? remaining : displayRemaining).toFixed(2)}`}
                    />
                  )}
                </>
              )}
            </>
          )}

          {/* ── Step 1: Propina ── */}
          {step === 1 && (
            <>
              <div className="flex flex-wrap gap-2">
                {TIP_OPTIONS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setTipPct(pct);
                      setShowCustomTip(false);
                      setCustomTip("");
                    }}
                    className={`min-h-11 min-w-16 flex-1 cursor-pointer rounded-lg border py-2.5 text-sm font-medium transition-all ${optionClass(
                      !showCustomTip && tipPct === pct,
                    )}`}
                  >
                    {pct === 0 ? "Sin propina" : `${pct}%`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowCustomTip(true)}
                  className={`min-h-11 min-w-16 flex-1 cursor-pointer rounded-lg border py-2.5 text-sm font-medium transition-all ${optionClass(
                    showCustomTip,
                  )}`}
                >
                  Otro
                </button>
              </div>

              {showCustomTip && (
                <Input
                  label="Monto de propina"
                  type="number"
                  min="0"
                  step="0.01"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  placeholder="0.00"
                />
              )}

              <div className={cardClass}>
                <p className={`mb-3 ${sectionLabel}`}>Desglose</p>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-tone-600">Subtotal</span>
                    <span className="text-tone-700">
                      ${displaySubtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-tone-600">Propina</span>
                    <span className="text-tone-700">
                      +${displayPropina.toFixed(2)}
                    </span>
                  </div>
                  {isTapPay && commissions.evenClientCharge > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-tone-600">Comisión Even</span>
                      <span className="text-tone-700">
                        +${commissions.evenClientCharge.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="my-1 h-px bg-stroke-soft" />
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-black">Total a cobrar</span>
                    <span className="text-base text-black">
                      ${totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Step 2: Método + Confirmación ── */}
          {step === 2 && (
            <>
              {/* Total */}
              <div className={`${cardClass} bg-even-grass/20 text-center`}>
                <p className={`mb-1 ${sectionLabel}`}>Total a cobrar</p>
                <p className="text-3xl font-bold text-even-evergreen">
                  ${totalAmount.toFixed(2)}
                </p>
              </div>

              {/* Método */}
              <div className="flex flex-col gap-2">
                <p className={sectionLabel}>Método de pago</p>
                <div className="flex gap-3">
                  {(["cash", "terminal"] as ManualPaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMethod(m);
                        setManualCardType(null);
                      }}
                      className={`flex min-h-11 flex-1 cursor-pointer flex-col items-center gap-2 rounded-lg border py-4 transition-all ${optionClass(
                        method === m,
                      )}`}
                    >
                      {m === "cash" ? (
                        <Banknote className="size-5" />
                      ) : (
                        <CreditCard className="size-5" />
                      )}
                      <span className="text-sm font-medium">
                        {m === "cash" ? "Efectivo" : "Terminal"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {method === "terminal" && (
                <div className="flex flex-col gap-2">
                  <p className={sectionLabel}>Tipo de tarjeta *</p>
                  <div className="flex gap-3">
                    {(
                      [
                        { type: "credito", label: "Crédito" },
                        { type: "debito", label: "Débito" },
                        { type: "amex", label: "Amex" },
                      ] as { type: ManualCardType; label: string }[]
                    ).map(({ type, label }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setManualCardType(type)}
                        className={`min-h-11 flex-1 cursor-pointer rounded-lg border py-3 text-sm font-medium transition-all ${optionClass(
                          manualCardType === type,
                        )}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {submitError && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger">
                  {submitError}
                </p>
              )}
            </>
          )}
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/auth";
import { Trash2 } from "lucide-react";
import {
  Button,
  CategoryTabs,
  FloatingCartButton,
  MenuEmptyState,
  MenuProductCard,
  MenuSearchInput,
  Modal,
  QuantityStepper,
  Spinner,
  Textarea,
} from "@even/ui";
import {
  getRestaurantMenu,
  type Branch,
  type MenuItem,
  type MenuSection,
} from "../../services/api";
import { MAX_NOTES_LENGTH, sendComanda } from "../../services/comandaApi";
import { getItemDisplayPrice } from "../../utils/commissionCalculator";
import CustomizeSheet from "./CustomizeSheet";
import {
  basePriceOf,
  buildLine,
  lineDisplayTotal,
  needsCustomization,
} from "./pricing";
import { comandaStorageKey, useComandaCart } from "./useComandaCart";

type Waiter = { id: string; name: string };

interface Props {
  branch: Branch;
  unit: string;
  // Hay cuenta abierta en la mesa: agrega a ella en vez de abrir una nueva.
  hasAccount: boolean;
  requireWaiterLogin: (onSuccess: (waiter: Waiter) => void) => void;
  onSent: () => void;
}

const ALL = "all";
const money = (n: number) => `$${n.toFixed(2)}`;
const cardLabels = {
  outOfStock: "Agotado",
  discount: (p: number) => `${p}% OFF`,
  increment: (n: string) => `Agregar ${n}`,
  decrement: (n: string) => `Quitar ${n}`,
  imageAlt: (n: string) => n,
};

type Cart = ReturnType<typeof useComandaCart>;

function Ticket({
  cart,
  title,
  submitting,
  error,
  onSend,
}: {
  cart: Cart;
  title: string;
  submitting: boolean;
  error: string | null;
  onSend: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="text-lg font-semibold text-even-evergreen">{title}</h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {cart.lines.length === 0 && (
          <li>
            <MenuEmptyState message="Aún no hay platillos en la comanda." />
          </li>
        )}
        {cart.lines.map((line) => (
          <li key={line.key} className="flex flex-col gap-1 border-b border-stroke-soft pb-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{line.name}</span>
              <span className="text-sm tabular-nums">{money(lineDisplayTotal(line))}</span>
            </div>
            {line.customFields.map((f) => (
              <p key={f.fieldId} className="text-xs text-tone-500">
                {f.selectedOptions
                  .map((o) => (o.quantity > 1 ? `${o.quantity}x ${o.optionName}` : o.optionName))
                  .join(", ")}
              </p>
            ))}
            <input
              aria-label={`Nota para ${line.name}`}
              defaultValue={line.specialInstructions ?? ""}
              onBlur={(e) => cart.setInstructions(line.key, e.target.value)}
              placeholder="Nota del platillo"
              className="rounded-md border border-stroke-soft px-2 py-1 text-xs"
            />
            <div className="flex items-center justify-between">
              <QuantityStepper
                variant="compact"
                value={line.quantity}
                min={1}
                onIncrement={() => cart.setQuantity(line.key, line.quantity + 1)}
                onDecrement={() => cart.setQuantity(line.key, line.quantity - 1)}
                labels={{ increment: `Más ${line.name}`, decrement: `Menos ${line.name}` }}
              />
              <button
                type="button"
                aria-label={`Quitar ${line.name}`}
                onClick={() => cart.removeLine(line.key)}
                className="flex size-11 items-center justify-center text-tone-500 hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Textarea
        label="Notas de la comanda"
        rows={2}
        maxLength={MAX_NOTES_LENGTH}
        value={cart.notes}
        onChange={(e) => cart.setNotes(e.target.value)}
        placeholder="Alergias, prisa, para compartir..."
      />
      <div className="flex items-center justify-between text-base font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{money(cart.total)}</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        fullWidth
        loading={submitting}
        disabled={cart.lines.length === 0}
        onClick={onSend}
      >
        Enviar a cocina
      </Button>
    </div>
  );
}

export default function ComandaBuilder({
  branch,
  unit,
  hasAccount,
  requireWaiterLogin,
  onSent,
}: Props) {
  const { getToken } = useAuth();
  const cart = useComandaCart(
    comandaStorageKey(branch.restaurant_id, branch.branch_number, unit),
  );
  const [sections, setSections] = useState<MenuSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState(ALL);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if (!cancelled) setSections(menu.filter((s) => s.is_active));
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, branch.restaurant_id, branch.branch_number]);

  const tabs = useMemo(
    () => [
      { id: ALL, label: "Todo" },
      ...sections.map((s) => ({ id: String(s.id), label: s.name })),
    ],
    [sections],
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => active === ALL || String(s.id) === active)
      .flatMap((s) => s.items)
      .filter((i) => i.is_available)
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [sections, active, query]);

  function openOrAdd(item: MenuItem) {
    if (item.is_out_of_stock) return;
    if (needsCustomization(item)) setCustom(item);
    else cart.addLine(buildLine(item, 1, {}, ""));
  }

  function send() {
    if (cart.lines.length === 0) return;
    setError(null);
    requireWaiterLogin(async (waiter) => {
      setSubmitting(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("No token");
        await sendComanda(
          {
            restaurantId: branch.restaurant_id,
            branchNumber: branch.branch_number,
            unit,
            waiter,
            lines: cart.lines,
            notes: cart.notes,
          },
          token,
          { claimWaiter: !hasAccount },
        );
        cart.clear();
        setCartOpen(false);
        onSent();
      } catch {
        setError("No se pudo enviar la comanda. Intenta de nuevo.");
      } finally {
        setSubmitting(false);
      }
    });
  }

  const title = hasAccount ? `Mesa ${unit} · agregar a la cuenta` : `Mesa ${unit} · abrir cuenta`;
  const ticket = (
    <Ticket cart={cart} title={title} submitting={submitting} error={error} onSend={send} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl bg-white p-3 text-black">
        <MenuSearchInput
          value={query}
          onChange={setQuery}
          onClear={() => setQuery("")}
          clearLabel="Limpiar búsqueda"
          placeholder="Buscar platillo"
        />
        <CategoryTabs tabs={tabs} activeId={active} onSelect={setActive} aria-label="Categorías" />
        <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-0">
          {loading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : loadError ? (
            <MenuEmptyState message="No se pudo cargar el menú." />
          ) : items.length === 0 ? (
            <MenuEmptyState message="Sin platillos que mostrar." />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const qty = cart.quantityOf(item.id);
                return (
                  <MenuProductCard
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    price={getItemDisplayPrice(item.price)}
                    finalPrice={getItemDisplayPrice(basePriceOf(item))}
                    discountPercent={item.discount}
                    imageUrl={item.image_url}
                    variant={item.image_url ? "image" : "compact"}
                    outOfStock={item.is_out_of_stock}
                    quantity={qty}
                    onOpen={() => openOrAdd(item)}
                    onIncrement={() =>
                      needsCustomization(item) ? setCustom(item) : cart.incrementItem(item.id)
                    }
                    onDecrement={() => cart.decrementItem(item.id)}
                    labels={cardLabels}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="hidden min-h-0 w-96 shrink-0 flex-col rounded-2xl bg-white p-4 text-black lg:flex">
        {ticket}
      </aside>

      <div className="lg:hidden">
        <FloatingCartButton
          count={cart.count}
          label={`Ver comanda • ${cart.count} · ${money(cart.total)}`}
          onClick={() => setCartOpen(true)}
          hidden={cartOpen || custom !== null}
        />
        <Modal open={cartOpen} onClose={() => setCartOpen(false)} aria-label="Comanda">
          <div className="flex max-h-[70dvh] flex-col">{ticket}</div>
        </Modal>
      </div>

      {custom && (
        <CustomizeSheet
          key={custom.id}
          item={custom}
          onClose={() => setCustom(null)}
          onAdd={(line) => {
            cart.addLine(line);
            setCustom(null);
          }}
        />
      )}
    </div>
  );
}

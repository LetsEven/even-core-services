"use client";

import MenuCategory from "./MenuCategory";
import PepperIcon from "../UI/PepperIcon";
import RestaurantDetailCard, {
  DETAIL_ANIMATION_MS,
} from "./RestaurantDetailCard";
import RestaurantIntro from "./RestaurantIntro";
import {
  CategoryTabs,
  FabDock,
  MorphPanel,
  MenuEmptyState,
  MenuRestaurantHeading,
  MenuSearchInput,
  SheetBackdrop,
  UserAvatar as SharedUserAvatar,
  setMenuCategory,
  takeMenuPosition,
  useModalBackClose,
  useRestaurantIntro,
  useScrollLock,
} from "@even/ui";
import {
  X,
  UserCircle,
  Utensils,
  RefreshCw,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Clock,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";
import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  useDeferredValue,
  useTransition,
  lazy,
  Suspense,
} from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useRestaurant } from "../../context/RestaurantContext";
import { useBranch } from "../../context/BranchContext";
import { useNavigation } from "../../hooks/useNavigation";
import { usePrepCountdown } from "../../hooks/usePrepCountdown";
const BranchSelectionModal = lazy(
  () => import("../modals/BranchSelectionModal"),
);
import {
  pickAndGoService,
  type ActiveOrderResponse,
  type PickAndGoItem,
} from "../../services/pickandgo.service";
import { useGuest } from "@/context/GuestContext";
import { overallProgress, useNow } from "../../lib/orderProgress";
const ReorderModal = lazy(() => import("../modals/ReorderModal"));
const OrdersSheet = lazy(() => import("./OrdersSheet"));

const ChatView = lazy(() => import("../ChatView"));
const CartView = lazy(() => import("../CartView"));
const AuthView = lazy(() => import("./../AuthView"));
const DashboardView = lazy(() => import("./../DashboardView"));
const RestaurantClosedModal = lazy(() => import("../RestaurantClosedModal"));

// Reutilizable para el avatar del usuario en header normal y sticky bar
interface UserAvatarProps {
  isAuthenticated: boolean;
  profile: { photoUrl?: string; firstName?: string } | null;
  iconSize?: string;
  textSize?: string;
}

function UserAvatar(props: UserAvatarProps) {
  const t = useTranslations("MenuView");
  return <SharedUserAvatar {...props} alt={t("profileAlt")} />;
}

export default function MenuView() {
  const t = useTranslations("MenuView");
  const tc = useTranslations("Common");
  const tr = useTranslations("RestaurantDetail");
  const { restaurantId: menuKey, menu: initialMenu } = useRestaurant();
  // Posición guardada al abrir un platillo (se consume una sola vez al montar)
  const [restored] = useState(() => {
    const position = takeMenuPosition(String(menuKey));
    if (
      position &&
      position.category !== "Todo" &&
      !initialMenu?.some((s) => s.name === position.category)
    ) {
      position.category = "Todo";
    }
    return position;
  });
  const [filter, setFilter] = useState(restored?.category ?? "Todo");
  const [searchQuery, setSearchQuery] = useState("");
  const [, startTransition] = useTransition();
  // activeCat es urgente (mueve la píldora ya); filter va en transición (filtra la lista)
  const [activeCat, setActiveCat] = useState(restored?.category ?? "Todo");

  useEffect(() => {
    setMenuCategory(activeCat);
  }, [activeCat]);

  // Regresa el platillo tocado a la misma altura de pantalla en la que estaba.
  // Se repite en el siguiente frame porque Next hace scroll al top al montar la ruta.
  useLayoutEffect(() => {
    if (!restored) return;
    const restore = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-menu-item-id="${CSS.escape(restored.itemId)}"]`,
      );
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top - restored.itemTop);
    };
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [restored]);
  const selectCategory = (cat: string) => {
    setActiveCat(cat);
    startTransition(() => setFilter(cat));
  };
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const logoButtonRef = useRef<HTMLButtonElement>(null);

  // Pantalla de bienvenida (hook compartido de @even/ui)
  const {
    phase: introPhase,
    active: introActive,
    logoTransform: introLogoTransform,
    logoRef: introLogoRef,
    skip: startIntroFly,
  } = useRestaurantIntro({ storageKey: menuKey, logoTargetRef: logoButtonRef });
  const [activeOrders, setActiveOrders] = useState<
    NonNullable<ActiveOrderResponse["data"]>[]
  >([]);
  const [activeOrderIndex, setActiveOrderIndex] = useState(0);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const closeStatusModal = () => setShowStatusModal(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [lastOrderItems, setLastOrderItems] = useState<PickAndGoItem[]>([]);
  const { user, profile, isAuthenticated, logout } = useAuth();
  const { state, refreshCart } = useCart();
  const { restaurant, menu, error } = useRestaurant();
  const showImages = !!restaurant && restaurant.menu_show_images !== false;
  const { branches, selectedBranchNumber } = useBranch();

  const { navigateWithRestaurantId } = useNavigation();
  const { guestId } = useGuest();
  const [showPepperChat, setShowPepperChat] = useState(false);
  const [isPepperClosing, setIsPepperClosing] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [isCartClosing, setIsCartClosing] = useState(false);
  const [isSettingsClosing, setIsSettingsClosing] = useState(false);
  const [showOrdersSheet, setShowOrdersSheet] = useState(false);
  const [isOrdersClosing, setIsOrdersClosing] = useState(false);
  const [dashboardInitialTab, setDashboardInitialTab] = useState<
    "profile" | "cards" | "history" | "support"
  >("profile");
  const [, setShowStickyBar] = useState(false);
  // La píldora (perfil, carrito, Pepper) se abre solo con el botón flotante.
  const [menuOpenByUser, setMenuOpenByUser] = useState(false);
  const [showClosedModal, setShowClosedModal] = useState(false);
  const stickyTriggerRef = useRef<HTMLDivElement>(null);

  // Abrir el dashboard en la pestaña de tarjetas cuando se regresa de agregar
  // una tarjeta (?dashboard=cards). Se limpia el parámetro para que un refresh
  // o reapertura del modal no lo vuelva a disparar.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("dashboard") === "cards") {
      setDashboardInitialTab("cards");
      setShowSettingsModal(true);
      url.searchParams.delete("dashboard");
      window.history.replaceState({}, "", url);
    }
  }, []);

  // Con Pepper Chat o el modal de Settings abiertos (Chat/Auth/Dashboard),
  // el body pasa a #F1F1F1 para que el overscroll bounce de iOS combine
  // con el gris de esos paneles en vez del blanco de la pantalla base.
  // No capturamos "previous" del DOM: el effect de arriba ya lo dejó en
  // "#ffffff", así que ese es el valor correcto al que hay que volver.
  useEffect(() => {
    const modalOpen =
      showPepperChat || showSettingsModal || showCart || showOrdersSheet;
    document.body.style.backgroundColor = modalOpen
      ? "var(--color-overscroll)"
      : "var(--color-background)";
    return () => {
      document.body.style.backgroundColor = "var(--color-background)";
    };
  }, [showPepperChat, showSettingsModal, showCart, showOrdersSheet]);

  const pillVisible = menuOpenByUser && !showDetail && !introActive;
  const closeActionsMenu = useCallback(() => setMenuOpenByUser(false), []);

  const closePepperChat = () => {
    setIsPepperClosing(true);
    refreshCart();
    setTimeout(() => {
      setShowPepperChat(false);
      setIsPepperClosing(false);
    }, 380);
  };

  const closeCart = () => {
    setIsCartClosing(true);
    setTimeout(() => {
      setShowCart(false);
      setIsCartClosing(false);
    }, 380);
  };

  const closeSettingsModal = () => {
    setIsSettingsClosing(true);
    setTimeout(() => {
      setShowSettingsModal(false);
      setIsSettingsClosing(false);
    }, 380);
  };

  const closeOrdersSheet = () => {
    setIsOrdersClosing(true);
    setTimeout(() => {
      setShowOrdersSheet(false);
      setIsOrdersClosing(false);
    }, 380);
  };

  // El back gesto/botón del dispositivo cierra estos modales en vez de
  // salir de la página (misma animación que cerrar con la X/backdrop).
  const closeDetail = useCallback(() => {
    setShowDetail(false);
    setTimeout(
      () => logoButtonRef.current?.focus({ preventScroll: true }),
      DETAIL_ANIMATION_MS,
    );
  }, []);
  useModalBackClose(showDetail, () => closeDetail());
  useModalBackClose(showPepperChat, () => closePepperChat());
  useModalBackClose(showSettingsModal, () => closeSettingsModal());
  useModalBackClose(showCart, () => closeCart());
  useModalBackClose(showOrdersSheet, () => closeOrdersSheet());

  // Logout desde el modal: primero cerrar con animación, luego limpiar la
  // sesión. Si se limpia antes, el modal re-renderiza su contenido como
  // AuthView/"Acceso denegado" durante la animación y se ve un flash.
  const handleSettingsLogout = () => {
    setIsSettingsClosing(true);
    setTimeout(() => {
      setShowSettingsModal(false);
      setIsSettingsClosing(false);
      logout();
    }, 380);
  };

  // Scroll lock unificado para todos los modales
  useScrollLock(
    showPepperChat ||
      showSettingsModal ||
      showCart ||
      showOrdersSheet ||
      showStatusModal ||
      showReorderModal ||
      showDetail ||
      introActive,
  );

  // Precargar chunks lazy después de que la página ya es interactiva
  useEffect(() => {
    const t = setTimeout(() => {
      import("./../DashboardView");
      import("./../AuthView");
      import("./../ChatView");
      import("./../CartView");
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const activeOrder = activeOrders[activeOrderIndex] ?? null;
  const progressNow = useNow(
    activeOrders.some((o) => o.pick_and_go_order?.cooking_status === "preparing"),
  );
  const fabProgress = overallProgress(activeOrders, progressNow);

  const { secondsLeft, extraMinutesAdded } = usePrepCountdown(
    activeOrder?.pick_and_go_order?.created_at ?? "",
    activeOrder?.pick_and_go_order?.prep_time_minutes ?? 15,
    activeOrder?.pick_and_go_order?.cooking_status ?? "idle",
  );

  const checkActiveOrder = useCallback(async () => {
    const clientId = user?.id || guestId;
    if (!clientId || !restaurant?.id) {
      setActiveOrders([]);
      setActiveOrderIndex(0);
      return;
    }
    try {
      const response: any = await pickAndGoService.getActiveOrderByUser(
        clientId,
        restaurant.id,
      );
      if (response.hasActiveOrder && response.orders?.length > 0) {
        setActiveOrders(response.orders);
        setActiveOrderIndex((prev) =>
          prev < response.orders.length ? prev : 0,
        );
      } else {
        setActiveOrders([]);
        setActiveOrderIndex(0);
      }
    } catch (error) {
      console.error("Error checking active order:", error);
    }
  }, [user?.id, guestId, restaurant?.id]);

  useEffect(() => {
    checkActiveOrder();
  }, [checkActiveOrder]);

  // Auto-poll while the active order is still being prepared
  useEffect(() => {
    const hasPreparing = activeOrders.some(
      (o) => o.pick_and_go_order?.cooking_status === "preparing",
    );
    if (!hasPreparing) return;
    const id = setInterval(checkActiveOrder, 10_000);
    return () => clearInterval(id);
  }, [activeOrders, checkActiveOrder]);

  const handleRefreshOrder = async () => {
    setIsRefreshing(true);
    await checkActiveOrder();
    setIsRefreshing(false);
  };

  // Mostrar barra sticky al hacer scroll past el trigger
  useEffect(() => {
    const trigger = stickyTriggerRef.current;
    if (!trigger) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, []);

  // Obtener categorías únicas del menú de la BD
  const categorias = useMemo(() => {
    const categories = ["Todo"];
    if (menu && menu.length > 0) {
      menu.forEach((section) => {
        if (section.name) categories.push(section.name);
      });
    }
    return categories;
  }, [menu]);

  const totalItems = state.totalItems;

  const deferredFilter = useDeferredValue(filter);
  const deferredSearch = useDeferredValue(searchQuery);

  // Filtrar menú usando valores diferidos — el render pesado ocurre en baja prioridad
  const filteredMenu = useMemo(() => {
    let filtered = menu;

    if (deferredFilter !== "Todo") {
      filtered = filtered.filter((section) => section.name === deferredFilter);
    }

    if (deferredSearch.trim()) {
      const query = deferredSearch.toLowerCase().trim();
      filtered = filtered
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              item.name.toLowerCase().includes(query) ||
              item.description?.toLowerCase().includes(query),
          ),
        }))
        .filter((section) => section.items.length > 0);
    }

    return filtered;
  }, [menu, deferredFilter, deferredSearch]);

  if (error) {
    return (
      <div className="min-h-screen brand-evergreen flex items-center justify-center">
        <div className="text-center px-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            {tc("errorTitle")}
          </h1>
          <p className="text-white">{error}</p>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen brand-evergreen flex items-center justify-center">
        <div className="text-center px-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            {t("restaurantNotFound")}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white relative">
      {restaurant.banner_url ? (
        <img
          src={restaurant.banner_url}
          alt=""
          fetchPriority="high"
          className="absolute -top-10 md:top-0 left-0 w-full h-(--menu-banner-h) object-cover banner-mobile z-0"
        />
      ) : (
        <div className="absolute top-0 left-0 w-full h-(--menu-banner-h) bg-even-evergreen banner-mobile z-0" />
      )}

      {/* Degradado para legibilidad del texto sobre el banner */}
      <div className="absolute top-0 left-0 w-full h-28 md:h-40 bg-linear-to-b from-black/55 to-transparent z-0 pointer-events-none" />

      {/* Espacio donde estaba el header con la hamburguesa. Además de conservar la posición de la
          carta, evita que el margen superior de <main> se escape del contenedor y baje el banner. */}
      <div aria-hidden className="h-15 md:h-19 lg:h-23" />

      {/* Logo + bienvenida sobre el banner (no sticky) */}
      <div className="absolute top-0 inset-x-0 z-6 pointer-events-none">
        <div className="container mx-auto px-5 md:px-8 lg:px-10 pt-5 md:pt-7 lg:pt-9">
          <div className="flex items-center gap-2 md:gap-3 h-10 md:h-12 lg:h-14 pr-24 md:pr-32 lg:pr-40">
            <button
              ref={logoButtonRef}
              type="button"
              onClick={() => (showDetail ? closeDetail() : setShowDetail(true))}
              aria-haspopup="dialog"
              aria-expanded={showDetail}
              aria-label={tr("openDetail")}
              style={{ opacity: introActive ? 0 : 1 }}
              className="pointer-events-auto size-10 md:size-12 lg:size-14 shrink-0 rounded-full bg-even-evergreen overflow-hidden border border-white/70 shadow-sm active:scale-95 transition-transform"
            >
              {restaurant.logo_url && (
                <img
                  src={restaurant.logo_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
            </button>
            {/* Con la intro activa (y durante el vuelo del logo) el texto queda
                invisible pero ocupando su espacio; aparece al aterrizar el logo.
                Sin intro no cambia de estado, así que no anima. */}
            <h1
              className="reduce-motion-fade text-white text-xl md:text-3xl lg:text-4xl font-medium truncate drop-shadow"
              style={{
                opacity: introActive ? 0 : 1,
                transform: introActive ? "translateX(-0.75rem)" : "none",
                transition:
                  "opacity 300ms ease, transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
              }}
            >
              {t("welcome", {
                gender: profile?.gender === "female" ? "female" : "other",
                name: profile?.firstName ? ` ${profile.firstName}` : "",
              })}
            </h1>
          </div>
        </div>
      </div>

      <main
        className="mt-(--menu-card-gap) relative z-10"
        inert={showDetail || introActive}
        aria-hidden={showDetail || introActive}
      >
        <div className="bg-white rounded-t-4xl flex flex-col items-center px-6 md:px-8 lg:px-10">
          {/* Trigger invisible para IntersectionObserver */}
          <div
            ref={stickyTriggerRef}
            className="absolute top-0 h-px w-px pointer-events-none"
          />
          {/* Nombre del restaurante + asistente */}
          <MenuRestaurantHeading
            name={restaurant.name}
          />

          <div className="w-full">
            <MenuSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t("searchPlaceholder")}
            />
          </div>

          <CategoryTabs
            className="mt-3 md:mt-5 mb-3 md:mb-5"
            aria-label={t("categoriesLabel")}
            tabs={categorias.map((cat) => ({
              id: cat,
              label: cat === "Todo" ? t("filterAll") : cat,
            }))}
            activeId={activeCat}
            onSelect={selectCategory}
          />

          {/* Items */}
          {filteredMenu.length > 0 ? (
            filteredMenu.map((section) => (
              <MenuCategory
                key={section.id}
                section={section}
                showSectionName={filter === "Todo"}
                onRestaurantClosed={() => setShowClosedModal(true)}
              />
            ))
          ) : (
            <MenuEmptyState
              message={
                searchQuery.trim()
                  ? t("noResultsFor", { query: searchQuery })
                  : t("noItemsAvailable")
              }
            />
          )}
        </div>
      </main>

      {/* Bienvenida al cargar la página */}
      {introActive && (
        <RestaurantIntro
          restaurant={restaurant}
          phase={introPhase === "fly" ? "fly" : "show"}
          branchName={
            selectedBranchNumber
              ? branches.find((b) => b.branch_number === selectedBranchNumber)
                  ?.name || tc("defaultBranchName")
              : null
          }
          welcomeText={t("welcome", {
            gender: profile?.gender === "female" ? "female" : "other",
            name: profile?.firstName ? ` ${profile.firstName}` : "",
          })}
          logoTransform={introLogoTransform}
          logoRef={introLogoRef}
          onSkip={startIntroFly}
        />
      )}

      {/* Detalle del restaurante (se intercambia con la tarjeta del menú) */}
      <RestaurantDetailCard
        restaurant={restaurant}
        branches={branches}
        selectedBranchNumber={selectedBranchNumber}
        open={showDetail}
        onClose={() => {
          if (!showBranchModal) closeDetail();
        }}
        onChangeBranch={() => setShowBranchModal(true)}
      />

      {/* Modal de selección de sucursal */}
      {showBranchModal && (
        <Suspense fallback={null}>
          <BranchSelectionModal
            isOpen={showBranchModal}
            onClose={() => setShowBranchModal(false)}
          />
        </Suspense>
      )}

      {/* Status Modal */}
      <MorphPanel
        open={showStatusModal && !!activeOrder}
        onClose={closeStatusModal}
        layoutId="active-order"
        label={t("activeOrderLabel")}
        className="mx-4 max-h-[88vh] bg-even-evergreen/95 border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] md:mx-12 lg:mx-28"
        radius={32}
      >
        {activeOrder && (
          <>
            {activeOrders.length > 1 && (
              <>
                <button
                  onClick={() => setActiveOrderIndex((i) => i - 1)}
                  disabled={activeOrderIndex === 0}
                  className="absolute left-3 md:left-4 top-[30%] z-10 rounded-full size-9 md:size-10 flex items-center justify-center bg-white/10 border border-white/25 hover:bg-white/20 transition-colors active:scale-90 disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ChevronLeft className="size-6 md:size-7 text-white" />
                </button>
                <button
                  onClick={() => setActiveOrderIndex((i) => i + 1)}
                  disabled={activeOrderIndex === activeOrders.length - 1}
                  className="absolute right-3 md:right-4 top-[30%] z-10 rounded-full size-9 md:size-10 flex items-center justify-center bg-white/10 border border-white/25 hover:bg-white/20 transition-colors active:scale-90 disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ChevronRight className="size-6 md:size-7 text-white" />
                </button>
              </>
            )}
            {/* Header */}
            <div className="flex-shrink-0">
              <div className="px-5 md:px-8 lg:px-10 pt-4 md:pt-5 flex items-center gap-3 md:gap-4">
                {restaurant?.logo_url ? (
                  <img
                    src={restaurant.logo_url}
                    alt={restaurant.name}
                    className="size-11 md:size-14 lg:size-16 object-cover rounded-lg shrink-0"
                  />
                ) : (
                  <Utensils className="size-11 md:size-14 lg:size-16 text-white shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl md:text-2xl lg:text-3xl text-white font-semibold leading-tight truncate">
                    {tc("orderNumber", {
                      folio: activeOrder.pick_and_go_order?.folio || "---",
                    })}
                  </h2>
                  <p className="text-sm md:text-base text-white/80 font-medium truncate">
                    {activeOrders.length > 1
                      ? tc("orderIndexOf", {
                          index: activeOrderIndex + 1,
                          count: activeOrders.length,
                        })
                      : activeOrder.pick_and_go_order?.customer_name ||
                        "Pick & Go"}
                  </p>
                </div>
                <button
                  onClick={closeStatusModal}
                  className="p-2 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors shrink-0 self-start"
                >
                  <X className="size-6 md:size-7 text-white" />
                </button>
              </div>
              {activeOrder.pick_and_go_order?.cooking_status === "preparing" &&
                (() => {
                  const prepMins =
                    activeOrder.pick_and_go_order?.prep_time_minutes ?? 15;
                  const rangeStart = new Date(
                    new Date(
                      activeOrder.pick_and_go_order?.created_at ?? "",
                    ).getTime() +
                      prepMins * 60_000,
                  );
                  const rangeEnd = new Date(rangeStart.getTime() + 5 * 60_000);
                  const fmt = (d: Date) =>
                    `${String(d.getHours()).padStart(2, "0")}:${String(
                      d.getMinutes(),
                    ).padStart(2, "0")}`;
                  return (
                    <div className="px-5 md:px-8 lg:px-10 mt-2 flex items-center gap-2 flex-wrap">
                      <div className="flex gap-1 items-center px-3 py-1 rounded-full bg-white/10 border border-white/10 text-sm text-white/70">
                        {tc("estimatedTime")}
                        <span>
                          {fmt(rangeStart)} - {fmt(rangeEnd)}
                        </span>
                      </div>
                      {extraMinutesAdded > 0 && (
                        <span className="text-xs font-medium text-positive-300 bg-positive-500/20 border border-positive-400/30 px-2 py-0.5 rounded-full">
                          {tc("extraMinutes", { minutes: extraMinutesAdded })}
                        </span>
                      )}
                    </div>
                  );
                })()}

              {/* Estatus General - 3 pasos */}
              <div className="px-6 md:px-8 lg:px-10 mt-3 mb-3 md:mb-4">
                <div className="flex items-center justify-center gap-4 md:gap-6 lg:gap-8">
                  {/* Preparando - siempre activo */}
                  <div className="flex flex-col items-center gap-1.5 md:gap-2">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center shadow-xs transition-all duration-300 bg-white border border-positive-200">
                      <Clock className="w-5 h-5 md:w-6 md:h-6 text-positive-600" />
                    </div>
                    <span className="text-xs md:text-sm font-medium text-positive-100">
                      {tc("statusPreparing")}
                    </span>
                  </div>

                  <div className="flex-1 max-w-12 md:max-w-16 lg:max-w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-white to-positive-200"
                      style={{
                        width: (() => {
                          if (
                            activeOrder.pick_and_go_order?.cooking_status !==
                            "preparing"
                          )
                            return "100%";
                          const prepMins =
                            activeOrder.pick_and_go_order?.prep_time_minutes ??
                            15;
                          const totalSecs = (prepMins + extraMinutesAdded) * 60;
                          const elapsed = totalSecs - secondsLeft;
                          return `${Math.min(100, Math.max(0, (elapsed / totalSecs) * 100))}%`;
                        })(),
                        transition: "width 1s linear",
                      }}
                    />
                  </div>

                  {/* Listo */}
                  <div className="flex flex-col items-center gap-1.5 md:gap-2">
                    <div
                      className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center shadow-xs transition-all duration-300 ${
                        (activeOrder.pick_and_go_order?.cooking_status ??
                          "preparing") === "ready" ||
                        (activeOrder.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "bg-positive-100 border border-positive-100"
                          : "bg-white/10"
                      }`}
                    >
                      <Utensils
                        className={`w-5 h-5 md:w-6 md:h-6 ${
                          (activeOrder.pick_and_go_order?.cooking_status ??
                            "preparing") === "ready" ||
                          (activeOrder.pick_and_go_order?.cooking_status ??
                            "preparing") === "delivered"
                            ? "text-positive-600"
                            : "text-white"
                        }`}
                      />
                    </div>
                    <span
                      className={`text-xs md:text-sm font-medium ${
                        (activeOrder.pick_and_go_order?.cooking_status ??
                          "preparing") === "ready" ||
                        (activeOrder.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "text-positive-100"
                          : "text-white/60"
                      }`}
                    >
                      {tc("statusReady")}
                    </span>
                  </div>

                  <div className="flex-1 max-w-12 md:max-w-16 lg:max-w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (activeOrder.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "w-full bg-gradient-to-r from-positive-200 to-positive-300"
                          : "w-0"
                      }`}
                    ></div>
                  </div>

                  {/* Entregado */}
                  <div className="flex flex-col items-center gap-1.5 md:gap-2">
                    <div
                      className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center shadow-xs transition-all duration-300 ${
                        (activeOrder.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "bg-positive-200 border border-positive-300"
                          : "bg-white/10"
                      }`}
                    >
                      <svg
                        className={`w-5 h-5 md:w-6 md:h-6 ${
                          (activeOrder.pick_and_go_order?.cooking_status ??
                            "preparing") === "delivered"
                            ? "text-positive-800"
                            : "text-white"
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <span
                      className={`text-xs md:text-sm font-medium ${
                        (activeOrder.pick_and_go_order?.cooking_status ??
                          "preparing") === "delivered"
                          ? "text-positive-100"
                          : "text-white/60"
                      }`}
                    >
                      {tc("statusDelivered")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-6 md:px-8 lg:px-10 border-t border-white/20 pt-3 md:pt-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-lg md:text-xl lg:text-2xl text-white">
                    {tc("orderedItems")}
                  </h3>
                  <button
                    onClick={handleRefreshOrder}
                    disabled={isRefreshing}
                    className="rounded-full hover:bg-white/10 p-1 md:p-1.5 lg:p-2 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`size-5 md:size-6 lg:size-7 text-white ${isRefreshing ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Order Items - Scrollable */}
            <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 pt-4 md:pt-5 lg:pt-6 pb-6 md:pb-8 lg:pb-10">
              {isRefreshing ? (
                <div className="flex justify-center items-center py-12 md:py-16 lg:py-20">
                  <Loader2 className="size-8 md:size-10 lg:size-12 animate-spin text-white" />
                </div>
              ) : activeOrder.dishes && activeOrder.dishes.length > 0 ? (
                <div className="space-y-3 md:space-y-4 lg:space-y-5">
                  {activeOrder.dishes.map((dish, index) => (
                    <div
                      key={dish.id || index}
                      className="flex items-center gap-3 md:gap-4 lg:gap-5 bg-white/5 rounded-xl md:rounded-2xl p-3 md:p-4 lg:p-5 border border-white/10"
                    >
                      {showImages && (
                        <div className="flex-shrink-0">
                          <div className="size-16 md:size-20 lg:size-24 bg-tone-300 rounded-sm flex items-center justify-center overflow-hidden">
                            {dish.images &&
                            dish.images.length > 0 &&
                            dish.images[0] ? (
                              <img
                                src={dish.images[0]}
                                alt={dish.item}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src="/even/even-asterisk-evergreen.svg"
                                alt="Logo Even"
                                className="size-10 md:size-12 lg:size-14 object-contain"
                              />
                            )}
                          </div>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base md:text-lg lg:text-xl text-white font-medium capitalize">
                          {dish.item}
                        </h3>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <p className="text-xs md:text-sm lg:text-base text-white/60">
                          {tc("quantityLabel", { quantity: dish.quantity })}
                        </p>
                        <p className="text-base md:text-lg lg:text-xl text-white font-medium">
                          ${(Number(dish.price) * dish.quantity).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-10 lg:py-12">
                  <p className="text-white/70 text-base md:text-lg lg:text-xl">
                    {tc("noOrderInfo")}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </MorphPanel>

      {/* Píldora de acciones — se abre con la hamburguesa o aparece al hacer
          scroll; siempre en el mismo lugar */}
      <FabDock
        open={pillVisible}
        onToggle={() => setMenuOpenByUser((open) => !open)}
        onClose={closeActionsMenu}
        count={totalItems}
        countLabel={(count) => t("fabCountLabel", { count })}
        hidden={
          showDetail ||
          introActive ||
          showPepperChat ||
          showSettingsModal ||
          showCart ||
          showOrdersSheet
        }
        menuLabel={t("menuLabel")}
        labels={{ open: t("openMenu"), close: t("closeMenu") }}
        items={[
          {
            id: "profile",
            label: t("profileAlt"),
            clip: true,
            icon: (
              <UserAvatar
                isAuthenticated={isAuthenticated}
                profile={profile}
                iconSize="size-6 md:size-7"
                textSize="text-base md:text-lg"
              />
            ),
            onClick: () => {
              closeActionsMenu();
              setShowSettingsModal(true);
            },
          },
          {
            id: "cart",
            label: t("viewCart", { count: state.totalItems }),
            count: state.totalItems,
            icon: <ShoppingCart className="size-5 md:size-6" strokeWidth={1.5} />,
            onClick: () => {
              closeActionsMenu();
              setShowCart(true);
            },
          },
          {
            id: "orders",
            label: t("ordersLabel"),
            icon: <ReceiptText className="size-5 md:size-6" strokeWidth={1.5} />,
            onClick: () => {
              closeActionsMenu();
              setShowOrdersSheet(true);
            },
          },
          {
            id: "pepper",
            label: t("pepperLabel"),
            clip: true,
            icon: <PepperIcon />,
            onClick: () => {
              closeActionsMenu();
              setShowPepperChat(true);
            },
          },
          // Pedido activo: siempre visible; al tocarlo se transforma en su detalle (MorphPanel).
          {
            id: "active-order",
            pinned: true,
            hidden: fabProgress === null,
            label: t("activeOrderLabel"),
            icon: <ShoppingBag className="size-5 md:size-6" />,
            progress: fabProgress,
            progressLabel: t("orderProgressLabel"),
            morphId: "active-order",
            expanded: showStatusModal,
            onClick: () => {
              closeActionsMenu();
              setShowStatusModal(true);
            },
          },
        ]}
      />

      {/* Pepper Chat Modal */}
      {showPepperChat && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            style={{
              animation: isPepperClosing
                ? "fadeOut 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "fade-in 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={closePepperChat}
          />
          <div
            className="fixed inset-x-0 z-50 flex flex-col rounded-t-3xl overflow-hidden shadow-2xl border-t border-white/30"
            style={{
              top: "12%",
              bottom: 0,
              paddingBottom: "env(safe-area-inset-bottom)",
              background: "rgba(255, 255, 255, 0.82)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              animation: isPepperClosing
                ? "slideDownModal 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "slideUp 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-tone-300/80" />
            </div>
            <Suspense fallback={null}>
              <ChatView onBack={closePepperChat} />
            </Suspense>
          </div>
        </>
      )}

      {/* Carrito: la imagen del restaurante desenfocada queda de fondo y solo
          la tarjeta sube desde abajo, tapando el menú */}
      {showCart && (
        <div className="fixed inset-0 z-50 isolate overflow-hidden">
          <SheetBackdrop
            style={{
              animation: isCartClosing
                ? "fadeOut 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "fade-in 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          />
          <Suspense fallback={null}>
            <div className="relative h-full">
              <CartView onClose={closeCart} closing={isCartClosing} />
            </div>
          </Suspense>
        </div>
      )}

      {/* Hoja de pedidos */}
      {showOrdersSheet && (
        <Suspense fallback={null}>
          <OrdersSheet
            closing={isOrdersClosing}
            onClose={closeOrdersSheet}
            activeOrders={activeOrders}
            clientId={user?.id || guestId}
            restaurantId={restaurant?.id}
            onOpenStatus={(index) => {
              setActiveOrderIndex(index);
              setShowStatusModal(true);
            }}
            onReorder={(items) => {
              setLastOrderItems(items);
              setShowReorderModal(true);
            }}
          />
        </Suspense>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div>
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            style={{
              animation: isSettingsClosing
                ? "fadeOut 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "fade-in 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={closeSettingsModal}
          />
          <div
            className="fixed inset-x-0 z-50 flex flex-col rounded-t-3xl shadow-2xl border-t border-white/20"
            style={{
              top: "5%",
              bottom: 0,
              paddingBottom: "env(safe-area-inset-bottom)",
              background: "rgba(255, 255, 255, 0.82)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              animation: isSettingsClosing
                ? "slideDownModal 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "slideUp 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-tone-300/80" />
            </div>
            <Suspense fallback={null}>
              {isAuthenticated && profile?.firstName ? (
                <div className="flex-1 min-h-0">
                  <DashboardView
                    onClose={closeSettingsModal}
                    onLogout={handleSettingsLogout}
                    initialTab={dashboardInitialTab}
                  />
                </div>
              ) : (
                <AuthView onClose={closeSettingsModal} />
              )}
            </Suspense>
          </div>
        </div>
      )}

      {/* Reorder Modal */}
      <Suspense fallback={null}>
        <ReorderModal
          isOpen={showReorderModal}
          onClose={() => setShowReorderModal(false)}
          items={lastOrderItems}
        />
      </Suspense>

      {/* Restaurant Closed Modal */}
      <Suspense fallback={null}>
        <RestaurantClosedModal
          isOpen={showClosedModal}
          onClose={() => setShowClosedModal(false)}
          openingHours={restaurant?.opening_hours}
          restaurantName={restaurant?.name}
          restaurantLogo={restaurant?.logo_url}
        />
      </Suspense>
    </div>
  );
}

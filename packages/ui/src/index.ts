// Primitivas de UI compartidas por las apps de Even. El tema de Tailwind vive en "@even/ui/theme.css".
export const PACKAGE_NAME = "@even/ui";

export { brandColors } from "./lib/colors";
export { cn } from "./lib/cn";
export { playMorphClose, playMorphOpen, prefersReducedMotion } from "./lib/button-morph";
export { getBlurredImage, peekBlurredImage, useBlurredImage } from "./lib/blurred-image";
export { lockScroll, unlockScroll } from "./lib/scroll-lock";
export { useScrollLock } from "./lib/use-scroll-lock";
export { useModalBackClose } from "./lib/use-modal-back-close";
export { rememberMenuPosition, setMenuCategory, takeMenuPosition, type MenuPosition } from "./lib/menu-scroll-memory";

export { Badge, type BadgeProps } from "./components/badge";
export { Button, buttonClasses, type ButtonProps, type ButtonSize, type ButtonVariant } from "./components/button";
export { Card, type CardProps } from "./components/card";
export { Checkbox, Radio, type CheckboxProps, type RadioProps } from "./components/choice";
export { EvenAsterisk, type EvenAsteriskProps } from "./components/even-asterisk";
export { Input, Textarea, type InputProps, type TextareaProps } from "./components/field";
export { IconButton, type IconButtonProps } from "./components/icon-button";
export {
  Container,
  Screen,
  Stack,
  type ContainerProps,
  type ScreenProps,
  type StackProps,
} from "./components/layout";
export {
  SheetBackdrop,
  SheetCard,
  SheetFooter,
  SheetHero,
  SheetScreen,
  sheetClasses,
  type SheetBackdropProps,
  type SheetCardProps,
  type SheetFooterProps,
  type SheetHeroProps,
  type SheetScreenProps,
} from "./components/sheet-screen";
export { FullScreenLoader, type FullScreenLoaderProps } from "./components/loader";
export { Modal, type ModalProps } from "./components/modal";
export {
  PRIVACY_URL,
  TERMS_URL,
  TermsCheckbox,
  termsLinks,
  type TermsCheckboxProps,
} from "./components/terms-checkbox";
export { TermsUpdateToast, type TermsUpdateToastProps } from "./components/terms-update-toast";
export { Spinner, type SpinnerProps } from "./components/spinner";
export {
  SpotPicker,
  type SpotPickerItem,
  type SpotPickerLabels,
  type SpotPickerProps,
  type SpotPickerStatus,
} from "./components/spot-picker";
export {
  DAY_KEYS,
  DETAIL_ANIMATION_MS,
  RestaurantDetailSheet,
  type DayKey,
  type RestaurantDetailLabels,
  type RestaurantDetailSheetProps,
  type RestaurantHours,
} from "./components/menu/restaurant-detail-sheet";
export {
  INTRO_FLY_MS,
  INTRO_SHOW_MS,
  RestaurantIntro,
  useRestaurantIntro,
  type IntroPhase,
  type RestaurantIntroLabels,
  type RestaurantIntroProps,
  type UseRestaurantIntroOptions,
} from "./components/menu/restaurant-intro";
export {
  MenuActions,
  MenuActionsPill,
  MenuHamburger,
  PillButton,
  PillCartButton,
  PillOrderButton,
  PillPepperButton,
  UserAvatar,
  type MenuActionsPillProps,
  type MenuActionsProps,
  type MenuHamburgerProps,
  type PillButtonProps,
  type PillPepperButtonProps,
  type UserAvatarProps,
} from "./components/menu/menu-actions-pill";
export { CategoryTabs, type CategoryTab, type CategoryTabsProps } from "./components/menu/category-tabs";
export { FloatingCartButton, type FloatingCartButtonProps } from "./components/menu/floating-cart-button";
export { MenuEmptyState, type MenuEmptyStateProps } from "./components/menu/menu-empty-state";
export {
  MenuFab,
  MenuActionsModal,
  OrderFab,
  type OrderFabProps,
  type MenuFabProps,
  type MenuActionsModalProps,
} from "./components/menu/menu-fab";
export { FabDock, type DockItem, type FabDockProps } from "./components/menu/fab-dock";
export { MorphPanel, type MorphPanelProps } from "./components/menu/morph-panel";
export { MotionProvider, SPRING } from "./components/menu/motion-provider";
export {
  ReceiptPaper,
  ReceiptRow,
  ReceiptRule,
  ReceiptStamp,
  RECEIPT_PRINT_MS,
  type ReceiptPaperProps,
} from "./components/receipt-paper";
export {
  PaidReceipt,
  type PaidReceiptDish,
  type PaidReceiptLabels,
  type PaidReceiptPayment,
  type PaidReceiptProps,
} from "./components/paid-receipt";
export { MenuProductCard, type MenuProductCardProps } from "./components/menu/menu-product-card";
export { MenuQuickAddModal, type MenuQuickAddModalProps } from "./components/menu/menu-quick-add-modal";
export { MenuRestaurantHeading, type MenuRestaurantHeadingProps } from "./components/menu/menu-restaurant-heading";
export { MenuSearchInput, type MenuSearchInputProps } from "./components/menu/menu-search-input";
export { QuantityStepper, type QuantityStepperProps } from "./components/menu/quantity-stepper";
export { DishFlight } from "./components/menu/dish-flight";
export { DishHeroImage } from "./components/menu/dish-hero-image";
export { DishBottomBar, type DishBottomBarProps } from "./components/menu/dish-bottom-bar";
export { DishLoadingShell } from "./components/menu/dish-loading-shell";
export { DishScreen, DishSheet } from "./components/menu/dish-layout";
export { PullToDismiss } from "./components/menu/pull-to-dismiss";
export { markDishReady, startDishClose, startDishFlight, useDishFlight } from "./lib/dish-transition";
export {
  DEFAULT_PAYMENT_RESULT_TIMING,
  PaymentResult,
  type PaymentResultProps,
  type PaymentResultTiming,
} from "./components/payment-result";
export { FlowCard, type FlowCardLayout, type FlowCardProps } from "./components/flow-card";
export {
  CardSelectionSkeleton,
  CartSkeleton,
  FlowHeroBlock,
  OrderConfirmSkeleton,
  PaymentOptionsSkeleton,
  StepHero,
  TipSkeleton,
  type TipSkeletonLabels,
  type CardSelectionSkeletonLabels,
  type OrderConfirmSkeletonLabels,
} from "./components/flow-skeletons";
export { FlowNavOverlay, FlowSkeletonBody, FlowTitle, Ghost, type FlowNavOverlayProps, type FlowScreen } from "./components/flow-nav-overlay";
export {
  DEFAULT_FLOW_TIMING,
  ENTER_MS,
  LEAVE_MS,
  type FlowTiming,
  flowStepOf,
  notifyRouteChanged,
  startRouteTransition,
  useFlowStepReady,
  usePendingFlowStep,
} from "./lib/route-transition";

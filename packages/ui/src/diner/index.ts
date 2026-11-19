/**
 * Piezas compartidas por las apps de comensal que dependen de next / next-intl y de los textos de sus
 * `messages` (mismos namespaces en las cinco apps). Va en una entrada aparte para que `@even/ui`
 * siga sin depender de next-intl (crew y checkout-demo no lo usan).
 */
export { default as EqualSplitView, useEqualSplitScreen } from "./EqualSplitView";
export { default as HighDemandBanner } from "./HighDemandBanner";
export { default as InvoiceModal } from "./InvoiceModal";
export { default as ItemCustomizations } from "./ItemCustomizations";
export { default as POSBlockedModal } from "./POSBlockedModal";
export { default as RouteTransitionGate } from "./RouteTransitionGate";
export { useTermsText } from "./use-terms-text";
export {
  FlowStepCard,
  FlowTransitionProvider,
  useFlowNavigation,
  type FlowStepCardProps,
  type FlowTransitionProviderProps,
} from "./FlowTransition";
export { default as UnavailableCartRow } from "./UnavailableCartRow";
export {
  default as UnavailableItemsModal,
  toUnavailableModalItems,
  type UnavailableModalItem,
} from "./UnavailableItemsModal";
export { default as PepperIcon } from "./PepperIcon";
export { PepperProvider, usePepper, type PepperMessage } from "./PepperContext";
export {
  PepperStatusAvatar,
  TwinPebbleApproved,
  TwinPebbleIdle,
  TwinPebbleThinking,
  TwinPebbleWorking,
  type ChatStatus,
} from "./PepperMascots";
export { default as SupportTab } from "./SupportTab";
export {
  default as AuthStepCard,
  AUTH_FLOW_STEPS,
  AUTH_STEP_NAMES,
  useAuthScreen,
  type AuthCopyOverrides,
  type AuthScreenOptions,
  type AuthStepCardProps,
  type AuthVariant,
} from "./auth/AuthStepCard";
export { default as AuthModalView, type AuthModalViewProps } from "./auth/AuthModalView";
export { PhoneStepForm, VerifyStepForm, ProfileStepForm, type GuestLink } from "./auth/AuthSteps";
export {
  usePhoneAuth,
  type AuthenticatedInfo,
  type AuthResult,
  type PhoneAuth,
  type PhoneAuthOptions,
  type PhoneAuthSession,
  type PhoneAuthStep,
  type ProfileFields,
} from "./auth/usePhoneAuth";
export {
  COUNTRIES,
  ageFromBirthDate,
  birthDateFromAge,
  formatPhoneInput,
  formatPhoneNumber,
  isProfileComplete,
  unwrapProfile,
} from "./auth/phone";

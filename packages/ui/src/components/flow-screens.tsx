import type { ReactNode } from "react";
import type { FlowScreen } from "./flow-nav-overlay";
import { AmountHero, TitleHero } from "./flow-hero";
import {
  AddCardSkeleton,
  CardSelectionSkeleton,
  ChooseAmountSkeletonBlock,
  SelectItemsSkeleton,
  CartSkeleton,
  OrderConfirmSkeleton,
  PaymentOptionsSkeleton,
  TipSkeleton,
  UserSkeleton,
  type AddCardSkeletonLabels,
  type CardSelectionSkeletonLabels,
  type OrderConfirmSkeletonLabels,
  type TipSkeletonLabels,
  type UserSkeletonLabels,
} from "./flow-skeletons";

/**
 * Pantallas (título + esqueleto + forma de la tarjeta) de cada tipo de paso del flujo de compra.
 *
 * Cada app arma su `screens` con estas funciones pasándoles solo sus textos; la forma (layout, relleno, tipografía)
 * vive aquí y la comparten el esqueleto de la transición y la vista real (`FlowStepCard`), así la tarjeta mide lo
 * mismo antes y después de cargar.
 */

type Context = {
  /** Línea de contexto sobre el título ("Mesa 12", "Habitación 301", "Pick & Go"). */
  context?: ReactNode;
  /** Color de la línea de contexto (por defecto `text-mint`). */
  contextClassName?: string;
};

/** Las vistas con monto llevan además la etiqueta sobre la cifra ("Total a pagar"). */
type AmountContext = Context & { amountLabel: ReactNode };

/** Hero "Monto protagonista": contexto · título, etiqueta y monto vivo que publica la vista (`useFlowAmount`). */
function amountHero({ context, contextClassName, title, amountLabel }: AmountContext & { title: ReactNode }) {
  return <AmountHero context={context} contextClassName={contextClassName} title={title} label={amountLabel} />;
}

/** Carrito: tarjeta que llena la pantalla con la lista y la barra inferior fija. */
export function cartScreen({
  context,
  contextClassName,
  title,
  labels,
}: Context & { title: ReactNode; labels: { myCart: string } }): FlowScreen {
  return {
    hero: <TitleHero context={context} contextClassName={contextClassName} title={title} />,
    body: <CartSkeleton labels={labels} />,
  };
}

/** Confirmación de pedido: tarjeta del alto de su contenido, anclada abajo. */
export function orderConfirmScreen({
  context,
  contextClassName,
  title,
  amountLabel,
  labels,
}: AmountContext & { title: ReactNode; labels: OrderConfirmSkeletonLabels }): FlowScreen {
  return {
    hero: amountHero({ context, contextClassName, title, amountLabel }),
    body: <OrderConfirmSkeleton labels={labels} />,
    layout: "anchored",
    cardClassName: "flex-none pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
  };
}

/** Opciones de pago (pagar todo, seleccionar artículos, dividir, elegir monto). */
export function paymentOptionsScreen({ context, contextClassName, title, amountLabel }: AmountContext & { title: ReactNode }): FlowScreen {
  return {
    hero: amountHero({ context, contextClassName, title, amountLabel }),
    body: <PaymentOptionsSkeleton />,
  };
}

/** Propina de la cuenta completa (o de un monto): tarjeta del alto de su contenido pegada abajo y a todo el ancho. */
export function tipScreen({
  context,
  contextClassName,
  title,
  amountLabel,
  labels,
}: AmountContext & { title: ReactNode; labels: TipSkeletonLabels }): FlowScreen {
  return {
    hero: amountHero({ context, contextClassName, title, amountLabel }),
    body: <TipSkeleton labels={labels} />,
    layout: "anchored",
    // px-0: el cuerpo de la propina trae su propio relleno lateral (px-8…).
    cardClassName: "flex-none px-0 md:px-0 lg:px-0 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pt-10 lg:pt-12",
  };
}

/** Propina de "elegir monto": el campo del monto sobre el resumen de la propina. */
export function chooseAmountScreen({
  context,
  contextClassName,
  title,
  amountLabel,
  labels,
  amountLabels,
  spaced,
}: AmountContext & {
  title: ReactNode;
  labels: TipSkeletonLabels;
  amountLabels: { amountToPay: string; maximum: string };
  /** Margen inferior bajo el campo del monto. */
  spaced?: boolean;
}): FlowScreen {
  return {
    ...tipScreen({ context, contextClassName, title, amountLabel, labels }),
    body: <TipSkeleton labels={labels} before={<ChooseAmountSkeletonBlock labels={amountLabels} spaced={spaced} />} />,
  };
}

/** Propina de "seleccionar artículos": la tarjeta crece con la lista y el resumen queda fijo abajo. */
export function selectItemsScreen({
  context,
  contextClassName,
  title,
  amountLabel,
  labels,
  showImages,
  showGuest,
  rows,
}: AmountContext & {
  title: ReactNode;
  labels: TipSkeletonLabels & { qty: string; price: string; hint: string };
  showImages?: boolean;
  showGuest?: boolean;
  /** Platillos por pagar, si ya se conocen. */
  rows?: number;
}): FlowScreen {
  return {
    hero: amountHero({ context, contextClassName, title, amountLabel }),
    body: <SelectItemsSkeleton labels={labels} showImages={showImages} showGuest={showGuest} rows={rows} />,
    layout: "anchored",
    // Al inicio no hay nada elegido (bajo el mínimo): la tarjeta reserva el alto del resumen fijo con su aviso.
    cardClassName: "flex-none px-0 md:px-0 lg:px-0 pt-8 pb-75 md:pt-10 lg:pt-12",
  };
}

/** Selección de método de pago: el total va en el hero y el botón de pagar abajo. */
export function cardSelectionScreen({
  context,
  contextClassName,
  title,
  amountLabel,
  labels,
}: AmountContext & { title: ReactNode; labels: CardSelectionSkeletonLabels }): FlowScreen {
  return {
    hero: amountHero({ context, contextClassName, title, amountLabel }),
    body: <CardSelectionSkeleton labels={labels} />,
    cardClassName: "z-50 overflow-hidden",
  };
}

/** Captura de nombre del invitado. */
export function userScreen({
  context,
  contextClassName,
  title,
  labels,
}: Context & { title: ReactNode; labels: UserSkeletonLabels }): FlowScreen {
  return {
    hero: <TitleHero context={context} contextClassName={contextClassName} title={title} />,
    body: <UserSkeleton labels={labels} />,
    cardClassName: "pb-32",
  };
}

/** Agregar tarjeta: formulario con título y subtítulo. */
export function addCardScreen({
  context,
  contextClassName,
  title,
  subtitle,
  labels,
}: Context & {
  title: ReactNode;
  subtitle: ReactNode;
  labels: AddCardSkeletonLabels;
}): FlowScreen {
  return {
    hero: <TitleHero context={context} contextClassName={contextClassName} title={title} subtitle={subtitle} />,
    body: <AddCardSkeleton labels={labels} />,
    cardClassName: "py-6 md:py-8 lg:py-10",
  };
}

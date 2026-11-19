import type { ReactNode } from "react";
import type { FlowScreen } from "./flow-nav-overlay";
import {
  AddCardSkeleton,
  CardSelectionSkeleton,
  ChooseAmountSkeletonBlock,
  SelectItemsSkeleton,
  CartSkeleton,
  OrderConfirmSkeleton,
  PaymentOptionsSkeleton,
  StepHero,
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
  /** Color de la línea de contexto (por defecto `text-mist`). */
  contextClassName?: string;
};

/** Carrito: tarjeta que llena la pantalla con la lista y la barra inferior fija. */
export function cartScreen({
  context,
  contextClassName,
  title,
  labels,
}: Context & { title: ReactNode; labels: { myCart: string } }): FlowScreen {
  return {
    hero: <StepHero label={context} labelClassName={contextClassName} title={title} />,
    body: <CartSkeleton labels={labels} />,
  };
}

/** Confirmación de pedido: tarjeta del alto de su contenido, anclada abajo. */
export function orderConfirmScreen({
  context,
  contextClassName,
  title,
  labels,
}: Context & { title: ReactNode; labels: OrderConfirmSkeletonLabels }): FlowScreen {
  return {
    hero: <StepHero label={context} labelClassName={contextClassName} title={title} />,
    body: <OrderConfirmSkeleton labels={labels} />,
    layout: "anchored",
    cardClassName: "flex-none overflow-y-auto py-8 max-h-[calc(100dvh-8rem)]",
  };
}

/** Opciones de pago (pagar todo, seleccionar artículos, dividir, elegir monto). */
export function paymentOptionsScreen({ context, contextClassName, title }: Context & { title: ReactNode }): FlowScreen {
  return {
    hero: <StepHero label={context} labelClassName={contextClassName} title={title} />,
    body: <PaymentOptionsSkeleton />,
  };
}

/** Propina de la cuenta completa (o de un monto): tarjeta del alto de su contenido pegada abajo y a todo el ancho. */
export function tipScreen({
  context,
  contextClassName,
  title,
  labels,
}: Context & { title: ReactNode; labels: TipSkeletonLabels }): FlowScreen {
  return {
    hero: <StepHero label={context} labelClassName={contextClassName} title={title} />,
    body: <TipSkeleton labels={labels} />,
    layout: "anchored",
    // px-0: el cuerpo de la propina trae su propio relleno lateral (px-8…).
    cardClassName: "flex-none px-0 md:px-0 lg:px-0 pt-8 pb-4 md:pt-10 md:pb-6 lg:pt-12",
  };
}

/** Propina de "elegir monto": el campo del monto sobre el resumen de la propina. */
export function chooseAmountScreen({
  context,
  contextClassName,
  title,
  labels,
  amountLabels,
  spaced,
}: Context & {
  title: ReactNode;
  labels: TipSkeletonLabels;
  amountLabels: { amountToPay: string; maximum: string };
  /** Margen inferior bajo el campo del monto. */
  spaced?: boolean;
}): FlowScreen {
  return {
    ...tipScreen({ context, contextClassName, title, labels }),
    body: <TipSkeleton labels={labels} before={<ChooseAmountSkeletonBlock labels={amountLabels} spaced={spaced} />} />,
  };
}

/** Propina de "seleccionar artículos": la tarjeta crece con la lista y el resumen queda fijo abajo. */
export function selectItemsScreen({
  context,
  contextClassName,
  title,
  labels,
  showImages,
  showGuest,
  rows,
}: Context & {
  title: ReactNode;
  labels: TipSkeletonLabels & { qty: string; price: string; hint: string };
  showImages?: boolean;
  showGuest?: boolean;
  /** Platillos por pagar, si ya se conocen. */
  rows?: number;
}): FlowScreen {
  return {
    hero: <StepHero label={context} labelClassName={contextClassName} title={title} />,
    body: <SelectItemsSkeleton labels={labels} showImages={showImages} showGuest={showGuest} rows={rows} />,
    layout: "anchored",
    // Al inicio no hay nada elegido (bajo el mínimo): la tarjeta reserva el alto del resumen fijo con su aviso.
    cardClassName: "flex-none px-0 md:px-0 lg:px-0 pt-8 pb-75 md:pt-10 lg:pt-12",
  };
}

/** Selección de método de pago. `showSubtotal={false}` para las apps cuyo resumen es solo el total. */
export function cardSelectionScreen({
  context,
  contextClassName,
  title,
  labels,
  showSubtotal,
}: Context & { title: ReactNode; labels: CardSelectionSkeletonLabels; showSubtotal?: boolean }): FlowScreen {
  return {
    hero: <StepHero label={context} labelClassName={contextClassName} title={title} />,
    body: <CardSelectionSkeleton labels={labels} showSubtotal={showSubtotal} />,
    cardClassName: "z-50 overflow-hidden",
  };
}

/** Captura de nombre del invitado. */
export function userScreen({ title, labels }: { title: ReactNode; labels: UserSkeletonLabels }): FlowScreen {
  return {
    hero: <StepHero title={title} />,
    body: <UserSkeleton labels={labels} />,
    cardClassName: "pb-32",
  };
}

/** Agregar tarjeta: formulario con título y subtítulo. */
export function addCardScreen({
  title,
  subtitle,
  labels,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  labels: AddCardSkeletonLabels;
}): FlowScreen {
  return {
    hero: (
      <div className="flex flex-col justify-center px-8 pt-6 pb-12 md:px-10 md:pt-7 md:pb-14 lg:px-12 lg:pt-8 lg:pb-16">
        <p className="mt-2 mb-2 text-3xl leading-7 font-medium text-white md:mt-3 md:mb-3 md:text-4xl lg:mt-4 lg:mb-4 lg:text-5xl">
          {title}
        </p>
        <p className="text-sm text-white/80 md:text-base lg:text-lg">{subtitle}</p>
      </div>
    ),
    body: <AddCardSkeleton labels={labels} />,
    cardClassName: "py-6 md:py-8 lg:py-10",
  };
}

import { DishFlight, MotionProvider } from "@even/ui";

import FlowBackdrop from "@/components/FlowBackdrop";
import FlowTransition from "@/components/FlowTransition";

export default function RestaurantLayout({ children }: LayoutProps<"/[restaurantId]">) {
  return (
    <FlowTransition>
      <FlowBackdrop />
      <MotionProvider>
        {children}
        <DishFlight />
      </MotionProvider>
    </FlowTransition>
  );
}

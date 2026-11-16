import { DishFlight, MotionProvider } from "@even/ui";

import FlowBackdrop from "@/components/FlowBackdrop";
import FlowNavOverlay from "@/components/FlowNavOverlay";

export default function RestaurantLayout({ children }: LayoutProps<"/[restaurantId]">) {
  return (
    <>
      <FlowBackdrop />
      <MotionProvider>
        {children}
        <DishFlight />
      </MotionProvider>
      <FlowNavOverlay />
    </>
  );
}

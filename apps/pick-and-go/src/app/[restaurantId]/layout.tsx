import FlowBackdrop from "@/components/FlowBackdrop";
import FlowNavOverlay from "@/components/FlowNavOverlay";

export default function RestaurantLayout({ children }: LayoutProps<"/[restaurantId]">) {
  return (
    <>
      <FlowBackdrop />
      {children}
      <FlowNavOverlay />
    </>
  );
}

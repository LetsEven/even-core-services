import type { ReactElement } from "react";
import type { OrderType } from "../types";
import type { HomeScreenProps } from "./homeScreenShared";
import {
  PickAndGoHome,
  TapPayHome,
  TapOrderHome,
  FlexBillHome,
  RoomServiceHome,
} from "./homeScreens";

export type { HomeScreenProps };

export const SERVICE_REGISTRY: Record<
  OrderType,
  { HomeScreen: (props: HomeScreenProps) => ReactElement }
> = {
  tap_pay: { HomeScreen: TapPayHome },
  tap: { HomeScreen: TapOrderHome },
  flex_bill: { HomeScreen: FlexBillHome },
  room: { HomeScreen: RoomServiceHome },
  pick_and_go: { HomeScreen: PickAndGoHome },
};

import { useOutletContext } from "react-router";
import type { CajaData } from "./useCajaData";

export function useCaja(): CajaData {
  return useOutletContext<CajaData>();
}

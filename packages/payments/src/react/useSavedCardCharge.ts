import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  createSavedCardCharge,
  type SavedCardCharge,
  type SavedCardChargeOptions,
} from "../saved-card-charge";

/**
 * Cobro con tarjeta guardada + /confirm con reintentos para el card-selection
 * de una app. Sin estado propio: devuelve `charge` y `confirm` estables que
 * siempre usan las opciones del último render (la página arma sus closures
 * con el estado de React actual). Ver `createSavedCardCharge`.
 */
export function useSavedCardCharge<TOrder, TBody = unknown>(
  options: SavedCardChargeOptions<TOrder, TBody>,
): SavedCardCharge<TOrder, TBody> {
  const ref = useRef(options);
  useEffect(() => {
    ref.current = options;
  });
  const charge = useCallback<SavedCardCharge<TOrder, TBody>["charge"]>(
    (params) => createSavedCardCharge(() => ref.current).charge(params),
    [],
  );
  const confirm = useCallback<SavedCardCharge<TOrder, TBody>["confirm"]>(
    (buildBody) => createSavedCardCharge(() => ref.current).confirm(buildBody),
    [],
  );
  return useMemo(() => ({ charge, confirm }), [charge, confirm]);
}

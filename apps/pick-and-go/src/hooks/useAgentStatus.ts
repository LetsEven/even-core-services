import { getBackendOrigin, prefetchResource } from "@even/api-client";
import { useCachedResource } from "@even/cart/react";

const API_BASE_URL = getBackendOrigin(
  process.env.NEXT_PUBLIC_API_URL,
  "http://localhost:5000",
);

interface AgentStatus {
  hasIntegration: boolean;
  isAgentConnected: boolean;
  isActive: boolean;
  providerName: string | null;
  isTurnoOpen: boolean | null;
}

const AGENT_STATUS_TTL_MS = 30_000;

const agentStatusKey = (restaurantId: string | number, branchNumber: number) =>
  `agent-status:${restaurantId}:${branchNumber}`;

async function fetchAgentStatus(
  restaurantId: string | number,
  branchNumber: number,
): Promise<AgentStatus> {
  const res = await fetch(
    `${API_BASE_URL}/api/pos/restaurant/${restaurantId}/branch/${branchNumber}/agent-status`,
  );
  if (!res.ok) throw new Error("Failed to fetch agent status");
  const data = await res.json();
  return {
        hasIntegration: data.hasIntegration ?? false,
        isAgentConnected: data.isAgentConnected ?? false,
        isActive: data.isActive ?? false,
        providerName: data.providerName ?? null,
        isTurnoOpen: data.isTurnoOpen ?? null,
  };
}

/** Precarga el estado del POS (p. ej. desde el carrito) para que el pago no espere. */
export function prefetchAgentStatus(
  restaurantId: string | number | null,
  branchNumber: number | null,
) {
  if (!restaurantId || !branchNumber) return;
  prefetchResource(
    agentStatusKey(restaurantId, branchNumber),
    () => fetchAgentStatus(restaurantId, branchNumber),
    { ttlMs: AGENT_STATUS_TTL_MS },
  );
}

export function useAgentStatus(
  restaurantId: string | number | null,
  branchNumber: number | null,
) {
  // Con valor en caché se pinta de inmediato y se revalida si venció.
  const { data, loading: isLoadingAgentStatus } = useCachedResource<AgentStatus>(
    restaurantId && branchNumber
      ? agentStatusKey(restaurantId, branchNumber)
      : null,
    () => fetchAgentStatus(restaurantId as string | number, branchNumber as number),
    { ttlMs: AGENT_STATUS_TTL_MS },
  );
  const agentStatus = data ?? null;

  const hasActivePOS =
    agentStatus !== null && agentStatus.hasIntegration && agentStatus.isActive;

  const isAgentRequired = hasActivePOS && !agentStatus.isAgentConnected;
  const isAgentDisconnected = hasActivePOS && !agentStatus.isAgentConnected;
  const isTurnoClosed =
    hasActivePOS &&
    agentStatus.isAgentConnected &&
    agentStatus.isTurnoOpen === false;

  return {
    agentStatus,
    isLoadingAgentStatus,
    isAgentRequired,
    isAgentDisconnected,
    isTurnoClosed,
  };
}

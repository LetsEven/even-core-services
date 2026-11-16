import { useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { IconButton } from "@even/ui";
import { AppLoader } from "../../app/guards";
import { useSession } from "../../app/session/context";
import ComandaBuilder from "../../features/comanda/ComandaBuilder";

// /mesas/:unidad/comanda — mesa libre (abre cuenta) o con cuenta (agrega).
export default function ComandaPage() {
  const { unidad = "" } = useParams();
  const navigate = useNavigate();
  const { currentBranch, branchesLoading, orders, requireWaiterLogin } =
    useSession();

  if (branchesLoading) return <AppLoader />;
  if (!currentBranch) {
    return <p className="p-6 text-even-offwhite">Selecciona una sucursal.</p>;
  }

  const hasAccount = orders.some(
    (o) => o.orderType === "flex_bill" && String(o.identifier) === unidad,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 text-even-offwhite">
        <IconButton aria-label="Volver a mesas" onClick={() => navigate("/mesas")}>
          <ArrowLeft className="size-5" aria-hidden />
        </IconButton>
        <h1 className="text-lg font-semibold">Comanda</h1>
      </div>
      <ComandaBuilder
        branch={currentBranch}
        unit={unidad}
        hasAccount={hasAccount}
        requireWaiterLogin={requireWaiterLogin}
        onSent={() => navigate("/mesas")}
      />
    </div>
  );
}

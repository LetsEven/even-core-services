import { useState } from "react";
import { Button, Modal } from "@even/ui";
import { QRCodeSVG } from "qrcode.react";
import { printTapPayTicket } from "../hooks/usePrinting";
import type { Order } from "../types";
import type { QRCodeRow } from "../services/api";
import { parseLocationCode } from "../utils/identifier";

interface Props {
  order: Order;
  qrCode: QRCodeRow | null;
  branchId: string;
  onClose: () => void;
}

export default function PrintTicketModal({
  order,
  qrCode,
  branchId,
  onClose,
}: Props) {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const tableCode = parseLocationCode(order.identifier);
  const dishTotal = order.dishes.reduce(
    (sum, d) => sum + (d.price ?? 0) * d.quantity,
    0,
  );
  const qrUrl = qrCode ? `https://letseven.io/qr/${qrCode.code}` : null;

  const handlePrint = async () => {
    setPrinting(true);
    setPrintError(null);
    try {
      await printTapPayTicket(branchId, order.dishes, order.identifier, qrUrl);
      onClose();
    } catch (e: any) {
      setPrintError(e?.message || "Error al imprimir");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!printing) onClose();
      }}
      title={tableCode != null ? `Mesa ${tableCode}` : order.identifier}
      description="Ticket"
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            fullWidth
            disabled={printing}
            onClick={onClose}
          >
            Cerrar
          </Button>
          <Button fullWidth loading={printing} onClick={handlePrint}>
            {printing ? "Imprimiendo..." : "Imprimir"}
          </Button>
        </div>
      }
    >
      <div>
        {order.dishes.map((dish) => (
          <div
            key={dish.id}
            className="flex justify-between border-b border-stroke-soft py-2.5 last:border-0"
          >
            <span className="text-sm capitalize text-tone-700">
              {dish.quantity > 1 ? `${dish.quantity}× ` : ""}
              {dish.item}
            </span>
            <span className="ml-4 shrink-0 text-sm font-medium text-black">
              ${((dish.price ?? 0) * dish.quantity).toFixed(2)}
            </span>
          </div>
        ))}
        <div className="mt-1 flex justify-between pt-3">
          <span className="text-base font-bold text-black">Total</span>
          <span className="text-base font-bold text-black">
            ${dishTotal.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 pt-4">
        {qrUrl ? (
          <>
            <div className="rounded-lg border border-stroke-soft bg-white p-3">
              <QRCodeSVG value={qrUrl} size={150} level="H" marginSize={0} />
            </div>
            <p className="text-center text-xs text-tone-600">
              Escanea para pagar
            </p>
          </>
        ) : (
          <p className="py-4 text-center text-sm text-tone-500">
            Sin QR asignado
          </p>
        )}
      </div>

      {printError && (
        <p className="pt-3 text-center text-xs text-danger">{printError}</p>
      )}
    </Modal>
  );
}

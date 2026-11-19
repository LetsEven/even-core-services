"use client";

import type { ComponentProps } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { PaidReceipt as CorePaidReceipt, type PaidReceiptLabels, type PaidReceiptProps } from "@even/ui";
import ItemCustomizations from "@/app/components/ItemCustomizations";

type Props = Omit<PaidReceiptProps, "tableLabel" | "formatDate" | "labels" | "renderCustomizations"> & {
  tableNumber: string | number;
};

/**
 * Ticket de "PAGADO" (se imprime con el sello y, al tocarlo, se expande con el desglose).
 * La animación y el diseño viven en `PaidReceipt` de @even/ui; aquí solo van los textos de la app.
 */
export default function PaidReceipt({ tableNumber, ...props }: Props) {
  const t = useTranslations("PaymentSuccessPage");
  const tc = useTranslations("Common");
  const format = useFormatter();

  const labels: PaidReceiptLabels = {
    total: t("totalLabel"),
    paidStamp: t("paidStamp"),
    tapForDetail: t("tapForDetail"),
    itemsCount: (count) => t("receiptItemsCount", { count }),
    orderItems: tc("orderItems"),
    consumption: t("consumptionLabel").replace("+ ", ""),
    tip: t("tipLabelPrefix").replace("+ ", ""),
    installments: (months) => t("installmentsLabel", { months }).replace("+ ", ""),
    download: t("downloadTicketCta"),
    viewInvoice: t("viewInvoiceCta"),
    invoice: tc("invoiceCta"),
    close: t("closeCta"),
  };

  return (
    <CorePaidReceipt
      {...props}
      tableLabel={tc("tableLabel", { table: tableNumber })}
      formatDate={(date) =>
        format.dateTime(date, { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
      }
      labels={labels}
      renderCustomizations={(dish, lineTotal) => (
        <ItemCustomizations
          customFields={dish.custom_fields as ComponentProps<typeof ItemCustomizations>["customFields"]}
          formatPrice={(price) => price * (lineTotal / (dish.total_price || 1))}
        />
      )}
    />
  );
}

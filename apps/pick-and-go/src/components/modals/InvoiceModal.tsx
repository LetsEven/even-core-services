"use client";

import type { ComponentProps } from "react";
import { InvoiceModal as SharedInvoiceModal } from "@even/ui/diner";
import { invoiceService } from "@/services/invoice.service";

type Props = Omit<ComponentProps<typeof SharedInvoiceModal>, "invoiceService">;

/** Modal de facturación compartido en `@even/ui/diner`; aquí solo se le inyecta el servicio de la app. */
export default function InvoiceModal(props: Props) {
  return <SharedInvoiceModal {...props} invoiceService={invoiceService} />;
}

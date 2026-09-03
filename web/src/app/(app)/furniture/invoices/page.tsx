"use client";

import { FurnitureInvoicesPanel } from "@/components/furniture/furniture-invoices-panel";
import { FurnitureShell } from "@/components/layout/furniture-shell";

export default function FurnitureInvoicesPage() {
  return (
    <FurnitureShell
      title="Invoices"
      subtitle="Billing, payments, and premium invoice documents."
    >
      <FurnitureInvoicesPanel />
    </FurnitureShell>
  );
}

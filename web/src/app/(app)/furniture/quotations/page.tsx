"use client";

import { FurnitureQuotationsPanel } from "@/components/furniture/furniture-quotations-panel";
import { FurnitureShell } from "@/components/layout/furniture-shell";

export default function FurnitureQuotationsPage() {
  return (
    <FurnitureShell
      title="Quotations"
      subtitle="Customer pricing, proposals, and printable quotation documents."
    >
      <FurnitureQuotationsPanel />
    </FurnitureShell>
  );
}

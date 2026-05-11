"use client";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { WorkspacePlaceholder } from "@/components/workspace/workspace-placeholder";

export default function ExpensesPage() {
  return (
    <BarbershopShell
      title="Expenses"
      subtitle="Operational spend and approvals."
    >
      <WorkspacePlaceholder title="Expenses" />
    </BarbershopShell>
  );
}

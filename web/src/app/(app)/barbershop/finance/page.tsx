"use client";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { FinanceArchive } from "@/components/ops/finance-archive";

export default function FinancePage() {
  return (
    <BarbershopShell
      title="Finance"
      subtitle="Monthly archive, profit posture, and payout signals."
    >
      <FinanceArchive />
    </BarbershopShell>
  );
}

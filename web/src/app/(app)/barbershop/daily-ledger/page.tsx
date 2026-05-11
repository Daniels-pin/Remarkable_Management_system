"use client";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { DailyLedgerPanel } from "@/components/ops/daily-ledger-panel";

export default function DailyLedgerPage() {
  return (
    <BarbershopShell
      title="Daily Ledger"
      subtitle="Services, sales, and expenses in one operational timeline."
    >
      <DailyLedgerPanel />
    </BarbershopShell>
  );
}

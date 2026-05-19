"use client";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { FinanceArchive } from "@/components/ops/finance-archive";
import { PersonalFinanceArchive } from "@/components/ops/personal-finance-archive";
import { useAuth } from "@/components/providers/auth-provider";
import { isPersonalFinanceRole } from "@/lib/roles";

export default function FinancePage() {
  const { session } = useAuth();
  const personal = isPersonalFinanceRole(session?.role);
  const isManager = session?.role === "manager";

  const subtitle = personal
    ? "Your earnings statements and payout history."
    : isManager
      ? "Shop revenue and daily operational expenses — no payroll or owner totals."
      : "Monthly archive, full expense structure, and payout controls.";

  return (
    <BarbershopShell title={personal ? "My earnings" : "Finance"} subtitle={subtitle}>
      {personal ? <PersonalFinanceArchive /> : <FinanceArchive />}
    </BarbershopShell>
  );
}

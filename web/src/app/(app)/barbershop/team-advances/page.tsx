"use client";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { RequireManagerOrAdmin } from "@/components/auth/guards";
import { TeamAdvancesPanel } from "@/components/ops/team-advances-panel";

export default function TeamAdvancesPage() {
  return (
    <RequireManagerOrAdmin>
      <BarbershopShell title="Team advances" subtitle="Payroll recoveries for cash and product credit">
        <TeamAdvancesPanel />
      </BarbershopShell>
    </RequireManagerOrAdmin>
  );
}

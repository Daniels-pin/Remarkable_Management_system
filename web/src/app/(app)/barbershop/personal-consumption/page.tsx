"use client";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { RequireManagerOrAdmin } from "@/components/auth/guards";
import { PersonalConsumptionPanel } from "@/components/ops/personal-consumption-panel";

export default function PersonalConsumptionPage() {
  return (
    <RequireManagerOrAdmin>
      <BarbershopShell
        title="Personal consumption"
        subtitle="Inventory withdrawals for admin and manager personal use"
      >
        <PersonalConsumptionPanel />
      </BarbershopShell>
    </RequireManagerOrAdmin>
  );
}

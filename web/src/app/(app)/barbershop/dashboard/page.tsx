"use client";

import { AdminOperationsDashboard } from "@/components/ops/admin-operations-dashboard";
import { BarberOperationsDashboard } from "@/components/ops/barber-operations-dashboard";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { useAuth } from "@/components/providers/auth-provider";

export default function BarberDashboardPage() {
  const { session } = useAuth();
  const isBarber = session?.role === "barber";

  return (
    <BarbershopShell
      title="Dashboard"
      subtitle={
        isBarber
          ? "Your month, payouts, and daily rhythm."
          : "Executive operational snapshot for the barbershop."
      }
    >
      {isBarber ? <BarberOperationsDashboard /> : <AdminOperationsDashboard />}
    </BarbershopShell>
  );
}

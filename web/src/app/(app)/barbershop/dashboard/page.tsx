"use client";

import { AdminOperationsDashboard } from "@/components/ops/admin-operations-dashboard";
import { BarberOperationsDashboard } from "@/components/ops/barber-operations-dashboard";
import { ManagerOperationsDashboard } from "@/components/ops/manager-operations-dashboard";
import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { isAdmin, isManager, isServiceProvider } from "@/lib/roles";

export default function BarberDashboardPage() {
  const { session } = useAuth();
  const role = session?.role;
  const providerView = isServiceProvider(role);
  const managerView = isManager(role);
  const adminView = isAdmin(role);

  const subtitle = providerView
    ? "Your month, payouts, and daily rhythm."
    : managerView
      ? "Operational performance, cashflow, and shop expenses."
      : "Executive financial snapshot for the barbershop.";

  return (
    <BarbershopShell title="Dashboard" subtitle={subtitle}>
      {providerView ? (
        <BarberOperationsDashboard />
      ) : adminView ? (
        <AdminOperationsDashboard />
      ) : managerView ? (
        <ManagerOperationsDashboard />
      ) : (
        <ManagerOperationsDashboard />
      )}
    </BarbershopShell>
  );
}

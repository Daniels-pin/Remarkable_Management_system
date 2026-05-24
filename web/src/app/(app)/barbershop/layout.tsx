"use client";

import { RequireBarbershopRoute } from "@/components/auth/guards";
import { OpsNotificationsProvider } from "@/components/ops/ops-notifications-context";
import { ReconciliationCountsProvider } from "@/components/ops/reconciliation-counts-context";

export default function BarbershopSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireBarbershopRoute>
      <OpsNotificationsProvider>
        <ReconciliationCountsProvider>{children}</ReconciliationCountsProvider>
      </OpsNotificationsProvider>
    </RequireBarbershopRoute>
  );
}

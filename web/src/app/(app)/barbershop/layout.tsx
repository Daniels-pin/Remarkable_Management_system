"use client";

import { RequireBarbershopRoute } from "@/components/auth/guards";
import { OperationalShell } from "@/components/layout/operational-shell";
import { PageHeaderProvider } from "@/components/layout/page-header-context";
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
        <ReconciliationCountsProvider>
          <PageHeaderProvider>
            <OperationalShell>{children}</OperationalShell>
          </PageHeaderProvider>
        </ReconciliationCountsProvider>
      </OpsNotificationsProvider>
    </RequireBarbershopRoute>
  );
}

"use client";

import { RequireFurnitureRoute } from "@/components/auth/guards";
import { FurnitureQuotationDraftRecoveryProvider } from "@/components/furniture/furniture-quotation-draft-recovery-provider";
import { OperationalShell } from "@/components/layout/operational-shell";
import { PageHeaderProvider } from "@/components/layout/page-header-context";

export default function FurnitureSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireFurnitureRoute>
      <FurnitureQuotationDraftRecoveryProvider>
        <PageHeaderProvider>
          <OperationalShell>{children}</OperationalShell>
        </PageHeaderProvider>
      </FurnitureQuotationDraftRecoveryProvider>
    </RequireFurnitureRoute>
  );
}

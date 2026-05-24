"use client";

import { RequireFurnitureRoute } from "@/components/auth/guards";
import { OperationalShell } from "@/components/layout/operational-shell";
import { PageHeaderProvider } from "@/components/layout/page-header-context";

export default function FurnitureSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireFurnitureRoute>
      <PageHeaderProvider>
        <OperationalShell>{children}</OperationalShell>
      </PageHeaderProvider>
    </RequireFurnitureRoute>
  );
}

"use client";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { NotificationsCenter } from "@/components/ops/notifications-center";

export default function NotificationsPage() {
  return (
    <BarbershopShell
      title="Notifications"
      subtitle="Approvals, reconciliation, and disputes only."
    >
      <NotificationsCenter />
    </BarbershopShell>
  );
}

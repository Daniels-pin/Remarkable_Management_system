"use client";

import { RequireBarbershopRoute } from "@/components/auth/guards";
import { OpsNotificationsProvider } from "@/components/ops/ops-notifications-context";

export default function BarbershopSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireBarbershopRoute>
      <OpsNotificationsProvider>{children}</OpsNotificationsProvider>
    </RequireBarbershopRoute>
  );
}

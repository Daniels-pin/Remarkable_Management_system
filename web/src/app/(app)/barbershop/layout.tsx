"use client";

import { OpsNotificationsProvider } from "@/components/ops/ops-notifications-context";

export default function BarbershopSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OpsNotificationsProvider>{children}</OpsNotificationsProvider>;
}

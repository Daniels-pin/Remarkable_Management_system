"use client";

import { FurnitureDashboardPanel } from "@/components/furniture/furniture-dashboard-panel";
import { FurnitureShell } from "@/components/layout/furniture-shell";

export default function FurnitureDashboardPage() {
  return (
    <FurnitureShell
      title="Furniture dashboard"
      subtitle="Operational order metrics and financial posture at a glance."
    >
      <FurnitureDashboardPanel />
    </FurnitureShell>
  );
}

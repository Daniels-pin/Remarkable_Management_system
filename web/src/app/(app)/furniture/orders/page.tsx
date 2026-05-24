"use client";

import { FurnitureOrdersPanel } from "@/components/furniture/furniture-orders-panel";
import { FurnitureShell } from "@/components/layout/furniture-shell";

export default function FurnitureOrdersPage() {
  return (
    <FurnitureShell
      title="Orders"
      subtitle="Create, track, and manage furniture production orders."
    >
      <FurnitureOrdersPanel />
    </FurnitureShell>
  );
}

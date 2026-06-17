"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { InventoryEmployeeSalesPanel } from "@/components/ops/inventory-employee-sales-panel";
import { useAuth } from "@/components/providers/auth-provider";

export default function InventoryReportsPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const allowed = session?.role === "admin" || session?.role === "manager";

  useEffect(() => {
    if (loading || !session) return;
    if (!allowed) router.replace("/barbershop/dashboard");
  }, [allowed, loading, router, session]);

  if (loading || !session || !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading…
      </div>
    );
  }

  return (
    <BarbershopShell
      title="Product sales by recorder"
      subtitle="Units sold and revenue attributed to the admin or manager who recorded each sale."
    >
      <InventoryEmployeeSalesPanel />
    </BarbershopShell>
  );
}

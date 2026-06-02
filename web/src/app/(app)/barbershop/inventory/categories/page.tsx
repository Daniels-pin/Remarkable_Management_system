"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { InventoryCategoriesPanel } from "@/components/ops/inventory-categories-panel";
import { useAuth } from "@/components/providers/auth-provider";

export default function InventoryCategoriesPage() {
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
      title="Inventory categories"
      subtitle="Organize barbershop retail products. Archive categories without losing history."
    >
      <InventoryCategoriesPanel />
    </BarbershopShell>
  );
}

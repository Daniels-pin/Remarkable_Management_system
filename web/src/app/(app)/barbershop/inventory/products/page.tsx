"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { InventoryProductsPanel } from "@/components/ops/inventory-products-panel";
import { useAuth } from "@/components/providers/auth-provider";

export default function InventoryProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
          Loading…
        </div>
      }
    >
      <InventoryProductsPageInner />
    </Suspense>
  );
}

function InventoryProductsPageInner() {
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
      title="Products"
      subtitle="Track stock, cost, selling price, and performance per SKU."
    >
      <InventoryProductsPanel />
    </BarbershopShell>
  );
}

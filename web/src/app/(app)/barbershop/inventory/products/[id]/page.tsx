"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { InventoryProductDetailPanel } from "@/components/ops/inventory-product-detail-panel";
import { useAuth } from "@/components/providers/auth-provider";

export default function InventoryProductDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const { session, loading } = useAuth();
  const allowed = session?.role === "admin" || session?.role === "manager";

  useEffect(() => {
    if (loading || !session) return;
    if (!allowed) router.replace("/barbershop/dashboard");
  }, [allowed, loading, router, session]);

  if (loading || !session || !allowed || !id) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading…
      </div>
    );
  }

  return (
    <BarbershopShell title="Product" subtitle="Stock, value, sales performance, and audit trail.">
      <InventoryProductDetailPanel productId={id} />
    </BarbershopShell>
  );
}

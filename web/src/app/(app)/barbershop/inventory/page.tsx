"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Layers, Package, Tag } from "lucide-react";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { getInventorySummary, listLowStockProducts } from "@/lib/api";
import { formatNaira } from "@/lib/format";
import * as React from "react";
import { SummaryMetricCard } from "@/components/ops/summary-metric-card";

export default function InventoryHubPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const allowed = session?.role === "admin" || session?.role === "manager";
  const isAdmin = session?.role === "admin";
  const [summary, setSummary] = React.useState<{
    inventory_value: string;
    period: { product_revenue: string; product_cost: string; product_profit: string };
    all_time?: { product_revenue: string; product_cost: string; product_profit: string };
    low_stock_count: number;
  } | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    if (!allowed) router.replace("/barbershop/dashboard");
  }, [allowed, loading, router, session]);

  React.useEffect(() => {
    if (!allowed) return;
    void Promise.all([getInventorySummary({ preset: "month" }), listLowStockProducts()]).then(
      ([s]) => setSummary(s),
    );
  }, [allowed]);

  if (loading || !session || !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading…
      </div>
    );
  }

  return (
    <BarbershopShell
      title="Inventory"
      subtitle="Barbershop retail — categories, products, stock, and product sales with profit tracking."
    >
      <div className="space-y-10">
        {summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryMetricCard
              label="Product revenue (month)"
              value={formatNaira(Number(summary.period.product_revenue))}
            />
            {isAdmin ? (
              <>
                <SummaryMetricCard
                  label="Product cost (month)"
                  value={formatNaira(Number(summary.period.product_cost))}
                />
                <SummaryMetricCard
                  label="Product profit (month)"
                  value={formatNaira(Number(summary.period.product_profit))}
                  tone="positive"
                />
                <SummaryMetricCard
                  label="Inventory value"
                  value={formatNaira(Number(summary.inventory_value))}
                  hint="Stock on hand at cost"
                />
                {summary.all_time ? (
                  <SummaryMetricCard
                    label="All-time product profit"
                    value={formatNaira(Number(summary.all_time.product_profit))}
                    tone="muted"
                    hint="Lifetime inventory profit"
                  />
                ) : null}
              </>
            ) : (
              <SummaryMetricCard
                label="Low stock items"
                value={String(summary.low_stock_count)}
                tone={summary.low_stock_count > 0 ? "negative" : "muted"}
              />
            )}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              href: "/barbershop/inventory/categories",
              icon: Layers,
              title: "Categories",
              body: "Perfume, Drinks, Hair Products…",
            },
            {
              href: "/barbershop/inventory/products",
              icon: Package,
              title: "Products",
              body: "Cost, price, stock, and alerts",
            },
            {
              href: "/barbershop/inventory/reports",
              icon: Tag,
              title: "Sales by recorder",
              body: "Revenue and profit per admin or manager",
            },
            {
              href: "/barbershop/daily-ledger",
              icon: Tag,
              title: "Record sale",
              body: "Product sales from Daily Ledger",
            },
          ].map(({ href, icon: Icon, title, body }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[var(--foreground)]/20"
            >
              <Icon className="mb-3 h-5 w-5 text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]" />
              <p className="font-medium text-[var(--foreground)]">{title}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{body}</p>
            </Link>
          ))}
        </div>
      </div>
    </BarbershopShell>
  );
}

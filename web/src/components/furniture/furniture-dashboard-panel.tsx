"use client";

import * as React from "react";

import { SummaryMetricCard } from "@/components/ops/summary-metric-card";
import { ApiError, getFurnitureDashboardSummary, type FurnitureDashboardSummary } from "@/lib/api";
import { subscribeFurnitureUpdated } from "@/lib/furniture-events";
import { formatCompactNaira, formatNaira } from "@/lib/format";
import { toast } from "sonner";

const EMPTY: FurnitureDashboardSummary = {
  orders: { total: 0, pending: 0, in_progress: 0, completed: 0 },
  financial: { total_revenue: 0, deposits_made: 0, outstanding_balance: 0 },
};

export function FurnitureDashboardPanel() {
  const [summary, setSummary] = React.useState<FurnitureDashboardSummary>(EMPTY);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const data = await getFurnitureDashboardSummary();
      setSummary(data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Could not load dashboard.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void load());
    return subscribeFurnitureUpdated(() => void load());
  }, [load]);

  const orders = summary.orders;
  const financial = summary.financial;

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Order status
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tracking-tight">
            Production pipeline
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard
            label="Total orders"
            value={loading ? "—" : String(orders.total)}
            hint="All orders created"
          />
          <SummaryMetricCard
            label="Pending"
            value={loading ? "—" : String(orders.pending)}
            hint="Not yet started"
            tone={orders.pending > 0 ? "negative" : "default"}
          />
          <SummaryMetricCard
            label="In progress"
            value={loading ? "—" : String(orders.in_progress)}
            hint="Under workshop processing"
            tone="default"
          />
          <SummaryMetricCard
            label="Completed"
            value={loading ? "—" : String(orders.completed)}
            hint="Production finished"
            tone={orders.completed > 0 ? "positive" : "muted"}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Financial summary
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-serif)] text-lg font-semibold tracking-tight">
            Revenue posture
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryMetricCard
            label="Total revenue"
            value={loading ? "—" : formatCompactNaira(financial.total_revenue)}
            hint={`Sum of all order totals · ${formatNaira(financial.total_revenue)}`}
          />
          <SummaryMetricCard
            label="Deposits made"
            value={loading ? "—" : formatCompactNaira(financial.deposits_made)}
            hint="Customer payments recorded"
            tone="positive"
          />
          <SummaryMetricCard
            label="Outstanding balance"
            value={loading ? "—" : formatCompactNaira(financial.outstanding_balance)}
            hint="Total revenue minus deposits"
            tone={financial.outstanding_balance > 0 ? "negative" : "muted"}
          />
        </div>
      </section>
    </div>
  );
}

"use client";

import { SummaryMetricCard } from "@/components/ops/summary-metric-card";
import { formatNaira } from "@/lib/format";
import type { FinancialMonthMetrics } from "@/lib/financial-month-metrics";
import { cn } from "@/lib/utils";

function metricValue(value: number | null): string {
  return value != null ? formatNaira(value) : "—";
}

type Props = {
  metrics: FinancialMonthMetrics;
  variant: "admin" | "manager";
  className?: string;
};

export function FinancialMonthSummaryGrid({ metrics, variant, className }: Props) {
  const isAdmin = variant === "admin";

  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Month summary
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryMetricCard
            label="Total revenue"
            value={metricValue(metrics.totalRevenue)}
            hint="Combined service and inventory revenue"
            className="h-full"
          />
          <SummaryMetricCard
            label="Service revenue"
            value={metricValue(metrics.serviceRevenue)}
            hint="Core service tickets"
            className="h-full"
          />
          <SummaryMetricCard
            label="Inventory revenue"
            value={metricValue(metrics.inventoryRevenue)}
            hint="Retail at chair and desk"
            className="h-full"
          />
          {isAdmin ? (
            <>
              <SummaryMetricCard
                label="Service net profit"
                value={metricValue(metrics.serviceNetProfit)}
                tone={
                  metrics.serviceNetProfit != null && metrics.serviceNetProfit >= 0
                    ? "positive"
                    : metrics.serviceNetProfit != null
                      ? "negative"
                      : "default"
                }
                hint="Service revenue minus service-side expenses"
                className="h-full"
              />
              <SummaryMetricCard
                label="Inventory profit"
                value={metricValue(metrics.inventoryProfit)}
                tone={
                  metrics.inventoryProfit != null && metrics.inventoryProfit > 0
                    ? "positive"
                    : "default"
                }
                hint="Inventory revenue minus cost of goods sold"
                className="h-full"
              />
              <SummaryMetricCard
                label="Monthly net profit"
                value={metricValue(metrics.businessNetProfit)}
                tone={
                  metrics.businessNetProfit != null && metrics.businessNetProfit >= 0
                    ? "positive"
                    : metrics.businessNetProfit != null
                      ? "negative"
                      : "default"
                }
                hint="Revenue after operational expenses, payroll obligations and inventory costs."
                className="h-full"
              />
              <SummaryMetricCard
                label="Commission total"
                value={metricValue(metrics.commissionTotal)}
                hint="Final commission payable across commission earners"
                className="h-full"
              />
              <SummaryMetricCard
                label="Salary total"
                value={metricValue(metrics.salaryTotal)}
                hint="Fixed salary obligations for the month"
                className="h-full"
              />
            </>
          ) : null}
          <SummaryMetricCard
            label="Operational expenses"
            value={metricValue(metrics.operationalExpenses)}
            hint="Daily shop-running costs"
            className="h-full"
          />
          {isAdmin ? (
            <SummaryMetricCard
              label="Shop expenses"
              value={metricValue(metrics.shopExpenses)}
              hint="Fuel, supplies, utilities, and daily spend"
              className="h-full"
            />
          ) : null}
          {isAdmin ? (
            <SummaryMetricCard
              label="Inventory value (closing stock)"
              value={metricValue(metrics.inventoryValue)}
              tone="muted"
              hint="Stock on hand at cost price"
              className="h-full"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { PaymentMethodBreakdown } from "@/components/ops/payment-method-breakdown";
import { SummaryMetricCard } from "@/components/ops/summary-metric-card";
import { Button } from "@/components/ui/button";
import { ApiError, getOperationsSummary } from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { mapOperationsSummary } from "@/lib/operations-analytics";
import { EMPTY_FINANCIAL_SNAPSHOT } from "@/lib/ops-initial-state";
import type { FinancialSnapshot } from "@/lib/ops-types";
import { ExpenseSourceBreakdownCard } from "@/components/ops/expense-source-breakdown";
import { toast } from "sonner";

type Preset = "today" | "week" | "month";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

export function ManagerOperationsDashboard() {
  const [preset, setPreset] = React.useState<Preset>("month");
  const [current, setCurrent] = React.useState<FinancialSnapshot>(EMPTY_FINANCIAL_SNAPSHOT);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(true);

  const loadAnalytics = React.useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const periodRes = await getOperationsSummary({ preset });
      setCurrent(mapOperationsSummary(periodRes));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load operations summary.");
      setCurrent(EMPTY_FINANCIAL_SNAPSHOT);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [preset]);

  React.useEffect(() => {
    queueMicrotask(() => void loadAnalytics());
  }, [loadAnalytics]);

  const operationalExpenses = current.operationalExpenses || current.totalExpenses;
  const noActivity =
    current.totalRevenue === 0 && operationalExpenses === 0;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
          Operations overview
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Daily rhythm for the floor — revenue, cashflow, services, and shop-running expenses.
          Payroll and owner-level finance stay in admin tools.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={preset === p.id ? "default" : "outline"}
            className={
              preset === p.id
                ? "rounded-full border-transparent bg-[var(--foreground)] text-[var(--background)]"
                : "rounded-full border-dashed"
            }
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Selected range
          </h3>
          <span className="text-xs text-[var(--muted-foreground)]">
            {analyticsLoading
              ? "Loading ledger aggregates…"
              : "Operational totals only — no payroll or profit."}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard
            label="Total revenue"
            value={formatNaira(current.totalRevenue)}
            hint={
              noActivity ? "No revenue recorded for this range yet." : "Services and retail combined"
            }
          />
          <SummaryMetricCard
            label="Services revenue"
            value={formatNaira(current.servicesRevenue)}
            hint="Core service tickets"
          />
          <SummaryMetricCard
            label="Product sales"
            value={formatNaira(current.productSalesRevenue)}
            hint="Retail at chair & desk"
          />
          <SummaryMetricCard
            label="Operational expenses"
            value={formatNaira(operationalExpenses)}
            tone="negative"
            hint="Fuel, supplies, utilities — excludes rent, salary & commission"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <ExpenseSourceBreakdownCard
          sources={current.expenseSources}
          variant="manager"
          className="lg:col-span-1"
        />
        <Card className="border-[var(--border)]/90 lg:col-span-2">
          <CardContent className="p-6 pt-6">
            <div className="mb-6 flex flex-col gap-1 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Cash & payments
                </p>
                <p className="mt-1 font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
                  {formatNaira(current.totalRevenue)} revenue
                </p>
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Spend tracked at{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {formatNaira(operationalExpenses)}
                </span>{" "}
                operational
              </p>
            </div>
            <PaymentMethodBreakdown snapshot={current} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

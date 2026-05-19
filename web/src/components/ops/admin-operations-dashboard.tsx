"use client";

import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { PaymentMethodBreakdown } from "@/components/ops/payment-method-breakdown";
import { SummaryMetricCard } from "@/components/ops/summary-metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, getOperationsSummary } from "@/lib/api";
import { formatNaira } from "@/lib/format";
import { mapOperationsSummary } from "@/lib/operations-analytics";
import {
  EMPTY_FINANCIAL_SNAPSHOT,
  INITIAL_ACTIVITY,
  INITIAL_APPROVALS,
  INITIAL_MANAGER_LOGS,
  INITIAL_RECONCILIATION_ALERTS,
} from "@/lib/ops-initial-state";
import type { FinancialSnapshot } from "@/lib/ops-types";
import { ExpenseSourceBreakdownCard } from "@/components/ops/expense-source-breakdown";
import { toast } from "sonner";

type Preset = "today" | "week" | "month" | "year" | "all" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "all", label: "All-time" },
  { id: "custom", label: "Custom" },
];

function ActivityList({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: { id: string; label: string; detail: string; at: string; tone?: string }[];
  emptyMessage: string;
}) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {title}
      </p>
      {items.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)]/60 px-4 py-8 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--card)] px-4 py-3"
            >
              <p className="text-sm font-medium text-[var(--foreground)]">{row.label}</p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{row.detail}</p>
              <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                {new Date(row.at).toLocaleString("en-NG", {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminOperationsDashboard() {
  const [preset, setPreset] = React.useState<Preset>("month");
  const [from, setFrom] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [to, setTo] = React.useState(() => new Date().toISOString().slice(0, 10));

  const [current, setCurrent] = React.useState<FinancialSnapshot>(EMPTY_FINANCIAL_SNAPSHOT);
  const [allTime, setAllTime] = React.useState<FinancialSnapshot>(EMPTY_FINANCIAL_SNAPSHOT);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(true);

  const loadAnalytics = React.useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const rangePreset = preset === "custom" ? "custom" : preset;
      const [periodRes, allRes] = await Promise.all([
        getOperationsSummary({
          preset: rangePreset,
          from: preset === "custom" ? from : undefined,
          to: preset === "custom" ? to : undefined,
        }),
        getOperationsSummary({ preset: "all" }),
      ]);
      setCurrent(mapOperationsSummary(periodRes));
      setAllTime(mapOperationsSummary(allRes));
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load operations summary.");
      setCurrent(EMPTY_FINANCIAL_SNAPSHOT);
      setAllTime(EMPTY_FINANCIAL_SNAPSHOT);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [preset, from, to]);

  React.useEffect(() => {
    queueMicrotask(() => void loadAnalytics());
  }, [loadAnalytics]);

  const noFinancialActivity =
    current.totalRevenue === 0 &&
    current.totalExpenses === 0 &&
    current.netProfit === 0;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
          Operations overview
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Executive snapshot of revenue, expenses, and cash behaviour. Adjust the period to
          align reviews with how your team actually works.
        </p>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
        {preset === "custom" ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dash-from" className="text-xs">
                From
              </Label>
              <Input
                id="dash-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dash-to" className="text-xs">
                To
              </Label>
              <Input
                id="dash-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-40"
              />
            </div>
          </div>
        ) : null}
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Selected range
          </h3>
          <span className="text-xs text-[var(--muted-foreground)]">
            {analyticsLoading
              ? "Loading ledger aggregates…"
              : "Totals reflect posted services, sales, and expenses."}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard
            label="Total revenue"
            value={formatNaira(current.totalRevenue)}
            hint={
              noFinancialActivity
                ? "No revenue recorded for this range yet."
                : undefined
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
            label="Net profit"
            value={formatNaira(current.netProfit)}
            tone={current.netProfit >= 0 ? "positive" : "negative"}
            hint={
              noFinancialActivity
                ? "Profit appears once revenue and expenses are posted."
                : "Revenue minus operational expenses and team payout obligations."
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard
            label="Total expenses"
            value={formatNaira(current.totalExpenses)}
            tone="negative"
            hint="Operational spend plus salary & commission"
          />
          <SummaryMetricCard
            label="Shop expenses"
            value={formatNaira(current.operationalExpenses)}
            hint="Fuel, supplies, utilities — daily operational costs"
          />
          <SummaryMetricCard
            label="Salary & commission"
            value={formatNaira(current.payrollCommission)}
            hint="Payroll and payout accounting"
          />
          <SummaryMetricCard
            label="All-time net (reference)"
            value={formatNaira(allTime.netProfit)}
            hint="Lifetime net from first posted service, sale, or expense."
            tone="muted"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <ExpenseSourceBreakdownCard
          sources={current.expenseSources}
          variant="admin"
          payrollCommission={current.payrollCommission}
          rentExpenses={current.rentExpenses}
          className="lg:col-span-1"
        />
        <Card className="border-[var(--border)]/90 lg:col-span-2">
          <CardContent className="p-6 pt-6">
            <div className="mb-6 flex flex-col gap-1 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Selected period · posture
                </p>
                <p className="mt-1 font-[family-name:var(--font-serif)] text-xl font-semibold text-[var(--foreground)]">
                  {formatNaira(current.totalRevenue)} revenue
                </p>
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                All-time roll-up{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {formatNaira(allTime.totalRevenue)}
                </span>
                {noFinancialActivity ? (
                  <span className="mt-1 block text-xs">
                    All-time totals stay at zero until the first ledger entry is posted.
                  </span>
                ) : null}
              </p>
            </div>
            <PaymentMethodBreakdown snapshot={current} />
          </CardContent>
        </Card>
        <Card className="border-rose-500/15 bg-gradient-to-b from-rose-500/[0.06] to-transparent">
          <CardContent className="space-y-3 p-6 pt-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Unresolved reconciliation
            </p>
            <ul className="space-y-2">
              {INITIAL_RECONCILIATION_ALERTS.length === 0 ? (
                <li className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-8 text-center">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No reconciliation exceptions open. Mismatches will surface here when
                    terminals and ledger totals disagree.
                  </p>
                </li>
              ) : (
                INITIAL_RECONCILIATION_ALERTS.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-[var(--radius-md)] border border-rose-500/20 bg-[var(--card)] px-3 py-3"
                  >
                    <p className="text-sm font-medium text-[var(--foreground)]">{a.title}</p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">{a.detail}</p>
                    <p className="mt-2 text-xs font-medium tabular-nums text-rose-700 dark:text-rose-300">
                      {a.amountDelta >= 0 ? "+" : ""}
                      {formatNaira(a.amountDelta)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-8 lg:grid-cols-3">
        <ActivityList
          title="Recent activity"
          items={INITIAL_ACTIVITY}
          emptyMessage="No operational activity yet. Closes, approvals, and stock moves will log here."
        />
        <ActivityList
          title="Manager activity logs"
          items={INITIAL_MANAGER_LOGS}
          emptyMessage="No manager audit trail yet."
        />
        <div>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Approvals
          </p>
          {INITIAL_APPROVALS.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--card)]/60 px-4 py-8 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                No approvals in queue. Payout batches and supplier spend will queue here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {INITIAL_APPROVALS.map((a) => (
                <li
                  key={a.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--card)] px-4 py-3"
                >
                  <p className="text-sm font-medium text-[var(--foreground)]">{a.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{a.meta}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                    {new Date(a.at).toLocaleString("en-NG", {
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

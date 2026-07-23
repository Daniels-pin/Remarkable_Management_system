"use client";

import * as React from "react";

import { SummaryMetricCard } from "@/components/ops/summary-metric-card";
import { formatNaira } from "@/lib/format";
import type { CashAtHandBreakdown } from "@/lib/ops-types";
import { cn } from "@/lib/utils";

type CashAtHandCardProps = {
  total: number;
  breakdown: CashAtHandBreakdown;
  className?: string;
  hint?: string;
};

const BREAKDOWN_ROWS: {
  key: keyof CashAtHandBreakdown;
  label: string;
  outflow?: boolean;
}[] = [
  { key: "cashServices", label: "Cash Services" },
  { key: "cashProductSales", label: "Cash Product Sales" },
  { key: "cashExpenses", label: "Cash Expenses", outflow: true },
  { key: "cashTeamAdvances", label: "Cash Team Advances", outflow: true },
];

export function CashAtHandCard({ total, breakdown, className, hint }: CashAtHandCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const hasActivity =
    breakdown.cashServices > 0 ||
    breakdown.cashProductSales > 0 ||
    breakdown.cashExpenses > 0 ||
    breakdown.cashTeamAdvances > 0;

  return (
    <div className={cn("space-y-0", className)}>
      <SummaryMetricCard
        label="Cash At Hand"
        value={formatNaira(total)}
        tone={total >= 0 ? "default" : "negative"}
        hint={
          hint ??
          (hasActivity
            ? "Expected physical cash in the shop right now"
            : "Live till balance — updates as cash transactions are recorded")
        }
        active={expanded}
        onClick={() => setExpanded((open) => !open)}
      />
      {expanded ? (
        <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)] p-5 shadow-[var(--shadow-card)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Financial breakdown
          </p>
          <div className="mt-4 space-y-3">
            {BREAKDOWN_ROWS.map(({ key, label, outflow }) => (
              <div
                key={key}
                className="flex items-baseline justify-between gap-4 border-b border-[var(--border)]/80 pb-3 last:border-b-0 last:pb-0"
              >
                <span className="text-sm text-[var(--foreground)]">{label}</span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    outflow ? "text-rose-700 dark:text-rose-300" : "text-[var(--foreground)]",
                  )}
                >
                  {outflow ? "−" : ""}
                  {formatNaira(breakdown[key])}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-[var(--border)] pt-4">
            <span className="text-sm font-medium text-[var(--foreground)]">Cash At Hand</span>
            <span
              className={cn(
                "font-[family-name:var(--font-serif)] text-xl font-semibold tabular-nums tracking-tight",
                total >= 0 ? "text-[var(--foreground)]" : "text-rose-700 dark:text-rose-300",
              )}
            >
              {formatNaira(total)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

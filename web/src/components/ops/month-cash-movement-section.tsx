"use client";

import { formatNaira } from "@/lib/format";
import type { FinancialMonthMetrics } from "@/lib/financial-month-metrics";
import { cn } from "@/lib/utils";

type MonthCashMovementSectionProps = {
  movement: number | null;
  breakdown: NonNullable<FinancialMonthMetrics["monthCashMovementBreakdown"]>;
  className?: string;
  compact?: boolean;
  /** Shorter row labels for locked archive months. */
  archived?: boolean;
};

const SUMMARY_ROWS = [
  { key: "cashServices" as const, label: "Cash Services Revenue" },
  { key: "cashProductSales" as const, label: "Cash Product Sales" },
  { key: "cashExpenses" as const, label: "Cash Shop Expenses", outflow: true },
  { key: "cashTeamAdvances" as const, label: "Cash Team Advances", outflow: true },
];

const ARCHIVE_ROWS = [
  { key: "cashServices" as const, label: "Cash Services" },
  { key: "cashProductSales" as const, label: "Cash Product Sales" },
  { key: "cashExpenses" as const, label: "Cash Expenses", outflow: true },
  { key: "cashTeamAdvances" as const, label: "Cash Team Advances", outflow: true },
];

export function MonthCashMovementSection({
  movement,
  breakdown,
  className,
  compact = false,
  archived = false,
}: MonthCashMovementSectionProps) {
  const rows = archived ? ARCHIVE_ROWS : SUMMARY_ROWS;
  const net =
    movement ??
    breakdown.cashServices +
      breakdown.cashProductSales -
      breakdown.cashExpenses -
      breakdown.cashTeamAdvances;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)]",
        compact ? "p-4" : "p-6",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        Cash At Hand
      </p>
      <p
        className={cn(
          "mt-2 font-[family-name:var(--font-serif)] font-semibold tabular-nums tracking-tight",
          compact ? "text-xl" : "text-2xl",
          net >= 0 ? "text-[var(--foreground)]" : "text-rose-700 dark:text-rose-300",
        )}
      >
        {formatNaira(net)}
      </p>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        {archived
          ? "Net cash movement for this archived month"
          : "Net cash generated and spent during this month"}
      </p>

      <div className={cn("mt-5 space-y-3", compact && "mt-4 space-y-2.5")}>
        {rows.map(({ key, label, outflow }) => (
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
        <span className="text-sm font-medium text-[var(--foreground)]">Net Cash Movement</span>
        <span
          className={cn(
            "font-[family-name:var(--font-serif)] text-xl font-semibold tabular-nums tracking-tight",
            net >= 0 ? "text-[var(--foreground)]" : "text-rose-700 dark:text-rose-300",
          )}
        >
          {formatNaira(net)}
        </span>
      </div>
    </div>
  );
}

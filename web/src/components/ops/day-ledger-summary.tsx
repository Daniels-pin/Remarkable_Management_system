"use client";

import { OperationalAlertBadge } from "@/components/ui/operational-alert-badge";
import { formatBusinessDayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function SummaryMetric({
  label,
  value,
  tone = "default",
  alert = false,
}: {
  label: string;
  value: number;
  tone?: "default" | "amber" | "rose";
  alert?: boolean;
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-900 dark:text-amber-100"
      : tone === "rose"
        ? "text-rose-800 dark:text-rose-200"
        : "text-[var(--foreground)]";

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)]/90 bg-[var(--card)] px-4 py-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          {label}
        </p>
        {alert && value > 0 ? <OperationalAlertBadge count={value} /> : null}
      </div>
      <p
        className={cn(
          "mt-1 font-[family-name:var(--font-serif)] text-2xl font-semibold tabular-nums tracking-tight",
          toneClass,
        )}
      >
        {value.toLocaleString("en-NG")}
      </p>
    </div>
  );
}

export function DayLedgerSummary({
  transactionCount,
  pendingCount,
  mismatchCount,
  businessDate,
  today,
  className,
}: {
  transactionCount: number;
  pendingCount: number;
  mismatchCount: number;
  businessDate: string;
  today: string;
  className?: string;
}) {
  const viewingToday = businessDate === today;
  const transactionLabel = viewingToday
    ? "Today's transactions"
    : `${formatBusinessDayLabel(businessDate)} transactions`;

  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      <SummaryMetric label={transactionLabel} value={transactionCount} />
      <SummaryMetric label="Pending" value={pendingCount} tone="amber" alert />
      <SummaryMetric label="Mismatch" value={mismatchCount} tone="rose" alert />
    </div>
  );
}
